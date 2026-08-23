import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '@common/errors/app.exception';
import { ErrorCode } from '@common/errors/error-codes';
import type { Locale } from '@db/enums';
import type { QuickEstimate } from '@db';
import {
  DEFAULT_BASE_RATE_AMD,
  DEFAULT_CEILING_COEFFICIENTS,
  DEFAULT_CONDITION_COEFFICIENTS,
  DEFAULT_OBJECT_TYPE_COEFFICIENTS,
  DEFAULT_RANGE_MAX,
  DEFAULT_RANGE_MIN,
  DEFAULT_WORK_SCOPE_COEFFICIENTS,
  ESTIMATE_VALIDITY_DAYS,
  EstimateValidationError,
  buildRateSet,
  calculateEstimate,
  type EstimateInput,
  type RateSet,
} from '@renovateam/pricing-core';
import { PricingRepository, type RateVersionWithRates } from './pricing.repository';
import type { PricingPublicService, QuickEstimateView, RateVersionView } from './public';

/** Ключи ставок, допустимые в наборе. Неизвестный ключ отклоняется. */
export const RATE_KEYS = [
  'base_rate_amd',
  'scope_turnkey',
  'scope_finishing',
  'scope_rough',
  'object_apartment',
  'object_house',
  'condition_new',
  'condition_secondary',
  'ceiling_up_to_3m',
  'ceiling_from_3m',
  'range_min',
  'range_max',
] as const;

/** Набор ставок по умолчанию — используется сидом и как исходная версия. */
export const DEFAULT_RATE_VALUES: Record<string, number> = {
  base_rate_amd: DEFAULT_BASE_RATE_AMD,
  scope_turnkey: DEFAULT_WORK_SCOPE_COEFFICIENTS.TURNKEY,
  scope_finishing: DEFAULT_WORK_SCOPE_COEFFICIENTS.FINISHING,
  scope_rough: DEFAULT_WORK_SCOPE_COEFFICIENTS.ROUGH,
  object_apartment: DEFAULT_OBJECT_TYPE_COEFFICIENTS.APARTMENT,
  object_house: DEFAULT_OBJECT_TYPE_COEFFICIENTS.HOUSE,
  condition_new: DEFAULT_CONDITION_COEFFICIENTS.NEW_BUILDING,
  condition_secondary: DEFAULT_CONDITION_COEFFICIENTS.SECONDARY_WITH_DEMOLITION,
  ceiling_up_to_3m: DEFAULT_CEILING_COEFFICIENTS.UP_TO_3M,
  ceiling_from_3m: DEFAULT_CEILING_COEFFICIENTS.FROM_3M,
  range_min: DEFAULT_RANGE_MIN,
  range_max: DEFAULT_RANGE_MAX,
};

/**
 * Сервис ценообразования.
 *
 * Формула здесь НЕ дублируется: расчёт делает @renovateam/pricing-core —
 * тот же код, что исполняется в браузере. Задача сервиса — достать активную
 * версию ставок, зафиксировать её и сохранить результат.
 */
@Injectable()
export class PricingService implements PricingPublicService {
  private readonly logger = new Logger(PricingService.name);

  constructor(private readonly repository: PricingRepository) {}

  async getActiveRateSet(): Promise<RateSet> {
    const version = await this.repository.findActiveVersion();
    if (!version) {
      throw new AppException(
        500,
        ErrorCode.INTERNAL_ERROR,
        'No active rate version — run the seed first',
      );
    }
    return toRateSet(version);
  }

  async createQuickEstimate(
    input: EstimateInput,
    userId: string | null,
    locale: Locale,
  ): Promise<QuickEstimateView> {
    // Версия фиксируется на старте: смена ставок админом в этот момент
    // не влияет на уже начатый расчёт (edge case из MVP §7).
    const rates = await this.getActiveRateSet();
    const result = this.calculate(input, rates);

    const expiresAt = new Date(Date.now() + ESTIMATE_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
    const saved = await this.repository.createQuickEstimate({
      userId,
      areaSqm: input.areaSqm,
      objectType: input.objectType,
      workScope: input.workScope,
      finishPackage: input.finishPackage,
      condition: input.condition,
      ceilingHeight: input.ceilingHeight,
      needsManual: result.needsManualReview,
      amountBase: result.needsManualReview ? null : result.amountBase,
      amountMin: result.needsManualReview ? null : result.amountMin,
      amountMax: result.needsManualReview ? null : result.amountMax,
      rateVersionId: rates.versionId,
      expiresAt,
      locale,
    });

    this.logger.log(
      `event=estimate_calculated package=${input.finishPackage} needsManual=${result.needsManualReview} version=${rates.versionId}`,
    );
    return toView(saved);
  }

  /** Расчёт без сохранения — используется и сервисом, и тестами. */
  calculate(input: EstimateInput, rates: RateSet) {
    try {
      return calculateEstimate(input, rates);
    } catch (error) {
      if (error instanceof EstimateValidationError) {
        throw new AppException(422, ErrorCode.AREA_OUT_OF_RANGE, error.message, {
          details: [{ field: 'areaSqm', code: error.code }],
        });
      }
      throw error;
    }
  }

  async getQuickEstimate(id: string): Promise<QuickEstimateView | null> {
    const estimate = await this.repository.findQuickEstimate(id);
    return estimate ? toView(estimate) : null;
  }

  async attachEstimatesToUser(estimateIds: string[], userId: string): Promise<void> {
    if (estimateIds.length === 0) return;
    await this.repository.attachToUser(estimateIds, userId);
  }

  async createRateVersion(
    rates: Record<string, number>,
    createdById: string,
    note?: string,
  ): Promise<{ versionId: string; createdAt: string }> {
    const details: Array<{ field: string; code: string }> = [];
    for (const [key, value] of Object.entries(rates)) {
      if (!(RATE_KEYS as readonly string[]).includes(key)) {
        details.push({ field: key, code: 'UNKNOWN_RATE_KEY' });
      } else if (!Number.isFinite(value) || value <= 0) {
        details.push({ field: key, code: 'MUST_BE_POSITIVE' });
      }
    }
    if (details.length > 0) {
      throw new AppException(422, ErrorCode.VALIDATION_FAILED, 'Invalid rate set', { details });
    }

    const version = await this.repository.createVersion(rates, createdById, note ?? null);
    this.logger.log(`event=rate_version_created version=${version.id} by=${createdById}`);
    return { versionId: version.id, createdAt: version.createdAt.toISOString() };
  }

  async listRateVersions(): Promise<RateVersionView[]> {
    const versions = await this.repository.listVersions();
    return versions.map((version) => ({
      id: version.id,
      isActive: version.isActive,
      note: version.note,
      createdAt: version.createdAt.toISOString(),
      createdBy: version.createdById ? { id: version.createdById } : null,
      rates: toRateValues(version),
    }));
  }
}

function toRateValues(version: RateVersionWithRates): Record<string, number> {
  return Object.fromEntries(version.rates.map((rate) => [rate.key, Number(rate.value)]));
}

export function toRateSet(version: RateVersionWithRates): RateSet {
  return buildRateSet(version.id, toRateValues(version));
}

function toView(estimate: QuickEstimate): QuickEstimateView {
  return {
    id: estimate.id,
    needsManual: estimate.needsManual,
    rateVersionId: estimate.rateVersionId,
    amountBase: estimate.amountBase,
    amountMin: estimate.amountMin,
    amountMax: estimate.amountMax,
    input: {
      areaSqm: Number(estimate.areaSqm),
      objectType: estimate.objectType,
      workScope: estimate.workScope,
      finishPackage: estimate.finishPackage,
      condition: estimate.condition,
      ceilingHeight: estimate.ceilingHeight,
    },
    expiresAt: estimate.expiresAt.toISOString(),
    createdAt: estimate.createdAt.toISOString(),
  };
}

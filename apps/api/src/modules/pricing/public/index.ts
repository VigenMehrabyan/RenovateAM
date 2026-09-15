import type { Locale } from '@db/enums';
import type {
  CeilingHeight,
  EstimateInput,
  FinishPackage,
  ObjectType,
  PropertyCondition,
  RateSet,
  WorkScope,
} from '@renovateam/pricing-core';

/** DI-токен публичного сервиса модуля pricing. */
export const PRICING_PUBLIC_SERVICE = 'PRICING_PUBLIC_SERVICE';

/**
 * Сохранённый быстрый расчёт в виде, пригодном для отдачи наружу.
 *
 * Параметры лежат плоско, а признак ручного рассмотрения называется
 * `needsManualReview` — так же, как в `EstimateResult` из pricing-core и в
 * ответе `POST /pricing/estimate` (ARCHITECTURE §5.2). Вложенный `input` и
 * имя `needsManual` были протечкой имён колонок БД наружу: фронт читал
 * `estimate.areaSqm`, сервер отдавал `estimate.input.areaSqm`, и карточка
 * сметчика показывала ключи i18n вместо подписей.
 */
export interface QuickEstimateView {
  id: string;
  needsManualReview: boolean;
  rateVersionId: string;
  /** null при дизайнерском пакете — сумм не существует. */
  amountBase: number | null;
  amountMin: number | null;
  amountMax: number | null;
  areaSqm: number;
  objectType: ObjectType;
  workScope: WorkScope;
  finishPackage: FinishPackage;
  condition: PropertyCondition;
  ceilingHeight: CeilingHeight;
  expiresAt: string;
  createdAt: string;
}

export interface PricingPublicService {
  /** Активный набор ставок вместе с идентификатором версии. */
  getActiveRateSet(): Promise<RateSet>;

  /** Считает и сохраняет расчёт, фиксируя версию ставок. */
  createQuickEstimate(
    input: EstimateInput,
    userId: string | null,
    locale: Locale,
  ): Promise<QuickEstimateView>;

  /** Читает сохранённый расчёт (requests кладёт его в заявку). */
  getQuickEstimate(id: string, forUserId?: string): Promise<QuickEstimateView | null>;

  /** Привязывает анонимные расчёты к пользователю после регистрации. */
  attachEstimatesToUser(estimateIds: string[], userId: string): Promise<void>;

  /** Создаёт новую версию ставок; предыдущие не изменяются и не удаляются. */
  createRateVersion(
    rates: Record<string, number>,
    createdById: string,
    note?: string,
  ): Promise<{ versionId: string; createdAt: string }>;

  /** История версий ставок для админки. */
  listRateVersions(): Promise<RateVersionView[]>;
}

export interface RateVersionView {
  id: string;
  isActive: boolean;
  note: string | null;
  createdAt: string;
  createdBy: { id: string } | null;
  rates: Record<string, number>;
}

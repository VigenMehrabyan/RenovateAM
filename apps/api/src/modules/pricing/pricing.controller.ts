import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '@common/decorators/public.decorator';
import { OptionalUser } from '@common/decorators/current-user.decorator';
import type { AuthUser } from '@common/types/auth-user';
import { Locale } from '@db/enums';
import { ESTIMATE_VALIDITY_DAYS } from '@renovateam/pricing-core';
import { EstimateDto } from './dto/estimate.dto';
import { PricingService } from './pricing.service';

/**
 * Публичные эндпоинты ценообразования.
 *
 * POST /pricing/estimate не является источником цены для UI: клиент считает
 * локально тем же pricing-core. Эндпоинт нужен, чтобы расчёт попал в БД
 * (аналитика воронки) и его можно было приложить к заявке.
 */
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Public()
  @Get('rates')
  async getRates() {
    const rates = await this.pricing.getActiveRateSet();
    return {
      versionId: rates.versionId,
      baseRateAmd: rates.baseRateAmd,
      workScope: rates.workScope,
      objectType: rates.objectType,
      condition: rates.condition,
      ceilingHeight: rates.ceilingHeight,
      rangeMin: rates.rangeMin,
      rangeMax: rates.rangeMax,
      validityDays: ESTIMATE_VALIDITY_DAYS,
    };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('estimate')
  @HttpCode(201)
  async estimate(@Body() dto: EstimateDto, @OptionalUser() user: AuthUser | undefined) {
    const view = await this.pricing.createQuickEstimate(
      {
        areaSqm: dto.areaSqm,
        objectType: dto.objectType,
        workScope: dto.workScope,
        finishPackage: dto.finishPackage,
        condition: dto.condition,
        ceilingHeight: dto.ceilingHeight,
      },
      user?.id ?? null,
      dto.locale ?? Locale.RU,
    );

    // Дизайнерский пакет: ни одного числового поля в ответе.
    if (view.needsManual) {
      return {
        id: view.id,
        needsManualReview: true as const,
        rateVersionId: view.rateVersionId,
        reason: 'DESIGNER_PACKAGE' as const,
        expiresAt: view.expiresAt,
      };
    }
    return {
      id: view.id,
      needsManualReview: false as const,
      rateVersionId: view.rateVersionId,
      amountBase: view.amountBase,
      amountMin: view.amountMin,
      amountMax: view.amountMax,
      currency: 'AMD' as const,
      expiresAt: view.expiresAt,
    };
  }
}

import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller';
import { PricingRepository } from './pricing.repository';
import { PricingService } from './pricing.service';
import { PRICING_PUBLIC_SERVICE } from './public';

/**
 * Модуль ценообразования. Репозиторий приватен; наружу экспортируется
 * только публичный сервис под токеном PRICING_PUBLIC_SERVICE.
 */
@Module({
  controllers: [PricingController],
  providers: [
    PricingService,
    PricingRepository,
    { provide: PRICING_PUBLIC_SERVICE, useExisting: PricingService },
  ],
  exports: [PRICING_PUBLIC_SERVICE],
})
export class PricingModule {}

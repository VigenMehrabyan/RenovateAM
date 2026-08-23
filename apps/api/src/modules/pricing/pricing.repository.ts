import { Injectable } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import type { Prisma, QuickEstimate, RateVersion, PricingRate } from '@db';

export type RateVersionWithRates = RateVersion & { rates: PricingRate[] };

/**
 * Приватный репозиторий модуля pricing. Владеет таблицами
 * rate_versions, pricing_rates, quick_estimates.
 */
@Injectable()
export class PricingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveVersion(): Promise<RateVersionWithRates | null> {
    return this.prisma.rateVersion.findFirst({
      where: { isActive: true },
      include: { rates: true },
    });
  }

  async listVersions(): Promise<RateVersionWithRates[]> {
    return this.prisma.rateVersion.findMany({
      include: { rates: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Создаёт новую версию и делает её активной. Старая версия сохраняется
   * целиком: `is_active` снимается, строки ставок не трогаются (US-7).
   */
  async createVersion(
    rates: Record<string, number>,
    createdById: string | null,
    note: string | null,
  ): Promise<RateVersion> {
    return this.prisma.$transaction(async (tx) => {
      await tx.rateVersion.updateMany({ where: { isActive: true }, data: { isActive: false } });
      return tx.rateVersion.create({
        data: {
          createdById,
          note,
          isActive: true,
          rates: {
            create: Object.entries(rates).map(([key, value]) => ({ key, value })),
          },
        },
      });
    });
  }

  async createQuickEstimate(
    data: Prisma.QuickEstimateUncheckedCreateInput,
  ): Promise<QuickEstimate> {
    return this.prisma.quickEstimate.create({ data });
  }

  async findQuickEstimate(id: string): Promise<QuickEstimate | null> {
    return this.prisma.quickEstimate.findUnique({ where: { id } });
  }

  async attachToUser(estimateIds: string[], userId: string): Promise<void> {
    await this.prisma.quickEstimate.updateMany({
      where: { id: { in: estimateIds }, userId: null },
      data: { userId },
    });
  }
}

import type { Locale } from '@db/enums';
import type { EstimateInput, RateSet } from '@renovateam/pricing-core';

/** DI-токен публичного сервиса модуля pricing. */
export const PRICING_PUBLIC_SERVICE = 'PRICING_PUBLIC_SERVICE';

/** Сохранённый быстрый расчёт в виде, пригодном для отдачи наружу. */
export interface QuickEstimateView {
  id: string;
  needsManual: boolean;
  rateVersionId: string;
  /** null при дизайнерском пакете — сумм не существует. */
  amountBase: number | null;
  amountMin: number | null;
  amountMax: number | null;
  input: EstimateInput;
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
  getQuickEstimate(id: string): Promise<QuickEstimateView | null>;

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

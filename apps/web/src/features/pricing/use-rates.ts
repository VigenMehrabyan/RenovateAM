/**
 * Актуальный набор ставок. Тянется один раз и кешируется TanStack Query:
 * цена считается локально движком pricing-core, сеть на пути расчёта не стоит.
 * Пока ответа нет (или он не пришёл вовсе) — работают значения по умолчанию.
 */
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_RATE_SET, ESTIMATE_VALIDITY_DAYS } from '@renovateam/pricing-core';
import type { RateSet } from '@renovateam/pricing-core';
import { pricingApi } from '@/lib/api';
import type { RatesResponse } from '@/lib/api-types';

export const RATES_QUERY_KEY = ['pricing', 'rates'] as const;

export function toRateSet(response: RatesResponse): RateSet {
  return {
    versionId: response.versionId,
    baseRateAmd: response.baseRateAmd,
    workScope: response.workScope,
    objectType: response.objectType,
    condition: response.condition,
    ceilingHeight: response.ceilingHeight,
    rangeMin: response.rangeMin,
    rangeMax: response.rangeMax,
  };
}

export interface RatesState {
  rates: RateSet;
  validityDays: number;
  isFallback: boolean;
  /**
   * Ответ ещё не пришёл и не провалился. Экраны, которые показывают сумму,
   * обязаны это состояние переждать: цифра, показанная по значениям по
   * умолчанию и затем изменившаяся на актуальные ставки, стоит дороже
   * секунды ожидания.
   */
  isLoading: boolean;
}

export function useRates(): RatesState {
  const { data, isPending } = useQuery({
    queryKey: RATES_QUERY_KEY,
    queryFn: () => pricingApi.rates(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (!data) {
    return {
      rates: DEFAULT_RATE_SET,
      validityDays: ESTIMATE_VALIDITY_DAYS,
      isFallback: true,
      isLoading: isPending,
    };
  }

  return {
    rates: toRateSet(data),
    validityDays: data.validityDays || ESTIMATE_VALIDITY_DAYS,
    isFallback: false,
    isLoading: false,
  };
}

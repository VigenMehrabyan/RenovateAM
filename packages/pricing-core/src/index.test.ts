import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RATE_SET,
  DEFAULT_BASE_RATE_AMD,
  EstimateValidationError,
  MAX_AREA_SQM,
  MIN_AREA_SQM,
  assertValidArea,
  buildRateSet,
  calculateEstimate,
  type CeilingHeight,
  type EstimateInput,
  type FinishPackage,
  type ObjectType,
  type PropertyCondition,
  type RateSet,
  type WorkScope,
} from './index';

const RATES: RateSet = { ...DEFAULT_RATE_SET, versionId: 'v-test' };

const baseInput: EstimateInput = {
  areaSqm: 80,
  objectType: 'APARTMENT',
  workScope: 'TURNKEY',
  finishPackage: 'STANDARD',
  condition: 'NEW_BUILDING',
  ceilingHeight: 'UP_TO_3M',
};

const OBJECT_TYPES: ObjectType[] = ['APARTMENT', 'HOUSE'];
const WORK_SCOPES: WorkScope[] = ['TURNKEY', 'FINISHING', 'ROUGH'];
const CONDITIONS: PropertyCondition[] = ['NEW_BUILDING', 'SECONDARY_WITH_DEMOLITION'];
const CEILINGS: CeilingHeight[] = ['UP_TO_3M', 'FROM_3M'];
const PACKAGES: FinishPackage[] = ['STANDARD', 'DESIGNER'];

describe('calculateEstimate — эталонный пример из README', () => {
  it('квартира 80 м², под ключ, новостройка, потолки до 3 м → 4 080 000 … 5 520 000 AMD', () => {
    const result = calculateEstimate(baseInput, RATES);
    expect(result.needsManualReview).toBe(false);
    if (result.needsManualReview) throw new Error('unreachable');
    expect(result.amountBase).toBe(4_800_000);
    expect(result.amountMin).toBe(4_080_000);
    expect(result.amountMax).toBe(5_520_000);
    expect(result.currency).toBe('AMD');
    expect(result.rateVersionId).toBe('v-test');
  });

  it('базовая ставка по умолчанию — 60 000 AMD за м²', () => {
    expect(DEFAULT_BASE_RATE_AMD).toBe(60_000);
    expect(DEFAULT_RATE_SET.baseRateAmd).toBe(60_000);
  });
});

describe('calculateEstimate — границы площади', () => {
  it.each([MIN_AREA_SQM, MIN_AREA_SQM + 0.01, 500, MAX_AREA_SQM - 0.01, MAX_AREA_SQM])(
    'площадь %s м² допустима',
    (areaSqm) => {
      expect(() => calculateEstimate({ ...baseInput, areaSqm }, RATES)).not.toThrow();
    },
  );

  it.each([MIN_AREA_SQM - 0.01, 9, 0, -100, MAX_AREA_SQM + 0.01, 1001, 100_000])(
    'площадь %s м² отклоняется с кодом AREA_OUT_OF_RANGE',
    (areaSqm) => {
      expect(() => calculateEstimate({ ...baseInput, areaSqm }, RATES)).toThrowError(
        EstimateValidationError,
      );
      try {
        calculateEstimate({ ...baseInput, areaSqm }, RATES);
      } catch (error) {
        expect((error as EstimateValidationError).code).toBe('AREA_OUT_OF_RANGE');
      }
    },
  );

  it.each([NaN, Infinity, -Infinity])('нечисловая площадь %s → AREA_NOT_A_NUMBER', (areaSqm) => {
    try {
      assertValidArea(areaSqm);
      throw new Error('должно было выбросить ошибку');
    } catch (error) {
      expect(error).toBeInstanceOf(EstimateValidationError);
      expect((error as EstimateValidationError).code).toBe('AREA_NOT_A_NUMBER');
    }
  });

  it('дизайнерский пакет тоже проверяет площадь', () => {
    expect(() =>
      calculateEstimate({ ...baseInput, finishPackage: 'DESIGNER', areaSqm: 5 }, RATES),
    ).toThrowError(EstimateValidationError);
  });
});

describe('calculateEstimate — коэффициенты', () => {
  it('перебирает все комбинации и совпадает с формулой README', () => {
    let combinations = 0;
    for (const objectType of OBJECT_TYPES) {
      for (const workScope of WORK_SCOPES) {
        for (const condition of CONDITIONS) {
          for (const ceilingHeight of CEILINGS) {
            const input: EstimateInput = {
              ...baseInput,
              areaSqm: 100,
              objectType,
              workScope,
              condition,
              ceilingHeight,
            };
            const result = calculateEstimate(input, RATES);
            if (result.needsManualReview) throw new Error('unreachable');

            const expectedRaw =
              100 *
              RATES.baseRateAmd *
              RATES.workScope[workScope] *
              RATES.objectType[objectType] *
              RATES.condition[condition] *
              RATES.ceilingHeight[ceilingHeight];

            expect(result.amountBase).toBe(Math.round(expectedRaw));
            expect(result.amountMin).toBe(Math.round(expectedRaw * 0.85));
            expect(result.amountMax).toBe(Math.round(expectedRaw * 1.15));
            expect(result.applied).toEqual({
              workScope: RATES.workScope[workScope],
              objectType: RATES.objectType[objectType],
              condition: RATES.condition[condition],
              ceilingHeight: RATES.ceilingHeight[ceilingHeight],
            });
            combinations += 1;
          }
        }
      }
    }
    expect(combinations).toBe(2 * 3 * 2 * 2);
  });

  it.each([
    ['TURNKEY', 1.0],
    ['FINISHING', 0.6],
    ['ROUGH', 0.45],
  ] as const)('коэффициент объёма работ %s = %s', (scope, multiplier) => {
    const result = calculateEstimate({ ...baseInput, areaSqm: 100, workScope: scope }, RATES);
    if (result.needsManualReview) throw new Error('unreachable');
    expect(result.amountBase).toBe(Math.round(100 * 60_000 * multiplier));
  });

  it('частный дом дороже квартиры на 15%', () => {
    const flat = calculateEstimate({ ...baseInput, objectType: 'APARTMENT' }, RATES);
    const house = calculateEstimate({ ...baseInput, objectType: 'HOUSE' }, RATES);
    if (flat.needsManualReview || house.needsManualReview) throw new Error('unreachable');
    expect(house.amountBase).toBe(Math.round(flat.amountBase * 1.15));
  });

  it('вторичка с демонтажом дороже новостройки на 15%', () => {
    const a = calculateEstimate({ ...baseInput, condition: 'NEW_BUILDING' }, RATES);
    const b = calculateEstimate({ ...baseInput, condition: 'SECONDARY_WITH_DEMOLITION' }, RATES);
    if (a.needsManualReview || b.needsManualReview) throw new Error('unreachable');
    expect(b.amountBase).toBe(Math.round(a.amountBase * 1.15));
  });

  it('потолки от 3 м дороже на 10%', () => {
    const a = calculateEstimate({ ...baseInput, ceilingHeight: 'UP_TO_3M' }, RATES);
    const b = calculateEstimate({ ...baseInput, ceilingHeight: 'FROM_3M' }, RATES);
    if (a.needsManualReview || b.needsManualReview) throw new Error('unreachable');
    expect(b.amountBase).toBe(Math.round(a.amountBase * 1.1));
  });
});

describe('calculateEstimate — дизайнерский пакет никогда не возвращает сумму', () => {
  it('перебор всех комбинаций входа: ни одного числового поля в ответе', () => {
    let checked = 0;
    for (const objectType of OBJECT_TYPES) {
      for (const workScope of WORK_SCOPES) {
        for (const condition of CONDITIONS) {
          for (const ceilingHeight of CEILINGS) {
            for (const areaSqm of [10, 33.33, 80, 999.99, 1000]) {
              const result = calculateEstimate(
                {
                  areaSqm,
                  objectType,
                  workScope,
                  condition,
                  ceilingHeight,
                  finishPackage: 'DESIGNER',
                },
                RATES,
              );

              expect(result.needsManualReview).toBe(true);
              // В объекте не должно быть НИ ОДНОГО числового поля — ни суммы, ни площади.
              const numericValues = Object.values(
                result as unknown as Record<string, unknown>,
              ).filter((value) => typeof value === 'number');
              expect(numericValues).toEqual([]);
              expect(Object.keys(result).sort()).toEqual([
                'needsManualReview',
                'rateVersionId',
                'reason',
              ]);
              expect(JSON.stringify(result)).not.toMatch(/\d{4,}/);
              checked += 1;
            }
          }
        }
      }
    }
    expect(checked).toBe(2 * 3 * 2 * 2 * 5);
  });

  it('стандартный пакет — единственный, который считается автоматически', () => {
    for (const finishPackage of PACKAGES) {
      const result = calculateEstimate({ ...baseInput, finishPackage }, RATES);
      expect(result.needsManualReview).toBe(finishPackage === 'DESIGNER');
    }
  });

  it('дизайнерский пакет всё равно фиксирует версию ставок', () => {
    const result = calculateEstimate({ ...baseInput, finishPackage: 'DESIGNER' }, RATES);
    expect(result.rateVersionId).toBe('v-test');
  });
});

describe('calculateEstimate — округление до целых драмов', () => {
  it.each([10.33, 47.77, 63.51, 88.89, 123.45, 999.99])(
    'площадь %s → все суммы целые',
    (areaSqm) => {
      const result = calculateEstimate(
        { ...baseInput, areaSqm, workScope: 'ROUGH', ceilingHeight: 'FROM_3M' },
        RATES,
      );
      if (result.needsManualReview) throw new Error('unreachable');
      expect(Number.isInteger(result.amountBase)).toBe(true);
      expect(Number.isInteger(result.amountMin)).toBe(true);
      expect(Number.isInteger(result.amountMax)).toBe(true);
    },
  );

  it('вилка округляется от сырого значения, а не от округлённой базы', () => {
    const result = calculateEstimate({ ...baseInput, areaSqm: 33.33 }, RATES);
    if (result.needsManualReview) throw new Error('unreachable');
    const raw = 33.33 * 60_000;
    expect(result.amountMin).toBe(Math.round(raw * 0.85));
    expect(result.amountMax).toBe(Math.round(raw * 1.15));
  });

  it('min < base < max при любых входных данных', () => {
    for (const areaSqm of [10, 50, 250, 1000]) {
      const result = calculateEstimate({ ...baseInput, areaSqm }, RATES);
      if (result.needsManualReview) throw new Error('unreachable');
      expect(result.amountMin).toBeLessThan(result.amountBase);
      expect(result.amountMax).toBeGreaterThan(result.amountBase);
    }
  });
});

describe('calculateEstimate — чистота функции', () => {
  it('одинаковый вход даёт одинаковый выход', () => {
    const first = calculateEstimate(baseInput, RATES);
    const second = calculateEstimate(baseInput, RATES);
    expect(first).toEqual(second);
  });

  it('не мутирует входные данные и ставки', () => {
    const input = { ...baseInput };
    const rates = structuredClone(RATES);
    calculateEstimate(input, rates);
    expect(input).toEqual(baseInput);
    expect(rates).toEqual(RATES);
  });
});

describe('buildRateSet', () => {
  it('собирает набор из плоской карты ключей', () => {
    const rates = buildRateSet('v-1', {
      base_rate_amd: 70_000,
      scope_rough: 0.5,
      object_house: 1.2,
      condition_secondary: 1.25,
      ceiling_from_3m: 1.15,
      range_min: 0.9,
      range_max: 1.1,
    });
    expect(rates.versionId).toBe('v-1');
    expect(rates.baseRateAmd).toBe(70_000);
    expect(rates.workScope.ROUGH).toBe(0.5);
    expect(rates.objectType.HOUSE).toBe(1.2);
    expect(rates.rangeMin).toBe(0.9);
  });

  it('подставляет значения по умолчанию для отсутствующих ключей', () => {
    const rates = buildRateSet('v-2', {});
    expect(rates.baseRateAmd).toBe(60_000);
    expect(rates.workScope).toEqual({ TURNKEY: 1, FINISHING: 0.6, ROUGH: 0.45 });
    expect(rates.objectType).toEqual({ APARTMENT: 1, HOUSE: 1.15 });
    expect(rates.condition).toEqual({ NEW_BUILDING: 1, SECONDARY_WITH_DEMOLITION: 1.15 });
    expect(rates.ceilingHeight).toEqual({ UP_TO_3M: 1, FROM_3M: 1.1 });
    expect(rates.rangeMin).toBe(0.85);
    expect(rates.rangeMax).toBe(1.15);
  });

  it('новая версия ставок меняет результат расчёта', () => {
    const v1 = buildRateSet('v-1', { base_rate_amd: 60_000 });
    const v2 = buildRateSet('v-2', { base_rate_amd: 90_000 });
    const r1 = calculateEstimate(baseInput, v1);
    const r2 = calculateEstimate(baseInput, v2);
    if (r1.needsManualReview || r2.needsManualReview) throw new Error('unreachable');
    expect(r1.amountBase).toBe(4_800_000);
    expect(r2.amountBase).toBe(7_200_000);
    expect(r1.rateVersionId).not.toBe(r2.rateVersionId);
  });
});

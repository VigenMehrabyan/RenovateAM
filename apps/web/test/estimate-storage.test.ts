import { beforeEach, describe, expect, it } from 'vitest';
import {
  attachEstimateId,
  clearEstimate,
  nextEstimateToken,
  readEstimate,
  saveEstimate,
} from '@/lib/estimate-storage';
import type { CalculatorValues } from '@/lib/validation';

const STANDARD: CalculatorValues = {
  areaSqm: 80,
  objectType: 'APARTMENT',
  workScope: 'TURNKEY',
  finishPackage: 'STANDARD',
  condition: 'NEW_BUILDING',
  ceilingHeight: 'UP_TO_3M',
};

const DESIGNER: CalculatorValues = { ...STANDARD, finishPackage: 'DESIGNER' };

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('хранилище последнего расчёта', () => {
  it('метки двух расчётов подряд различаются', () => {
    expect(nextEstimateToken()).not.toBe(nextEstimateToken());
  });

  it('дописывает id к своему расчёту', () => {
    const token = nextEstimateToken();
    saveEstimate({ input: STANDARD, calculatedAt: '2026-08-23T10:00:00.000Z', token });

    attachEstimateId(token, 'qe-1');

    expect(readEstimate()?.estimateId).toBe('qe-1');
  });

  it('запоздавший ответ прошлого расчёта не подменяет свежий', () => {
    // Пользователь посчитал стандартный пакет...
    const first = nextEstimateToken();
    saveEstimate({ input: STANDARD, calculatedAt: '2026-08-23T10:00:00.000Z', token: first });

    // ...вернулся и пересчитал уже дизайнерский, пока первый запрос был в пути.
    const second = nextEstimateToken();
    saveEstimate({ input: DESIGNER, calculatedAt: '2026-08-23T10:00:05.000Z', token: second });

    attachEstimateId(first, 'qe-standard');

    const stored = readEstimate();
    // Иначе после перезагрузки дизайнерский проект показал бы сумму
    // стандартного пакета, а к заявке прикрепился бы чужой расчёт.
    expect(stored?.input.finishPackage).toBe('DESIGNER');
    expect(stored?.estimateId).toBeUndefined();
  });

  it('ничего не пишет, если расчёт уже очищен', () => {
    const token = nextEstimateToken();
    saveEstimate({ input: STANDARD, calculatedAt: '2026-08-23T10:00:00.000Z', token });
    clearEstimate();

    attachEstimateId(token, 'qe-1');

    expect(readEstimate()).toBeNull();
  });
});

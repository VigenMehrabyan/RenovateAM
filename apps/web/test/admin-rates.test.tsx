import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { App } from '@/App';
import { makeUser, renderWithProviders } from './render';

/**
 * Набор ставок, отличный от встроенных значений по умолчанию по каждому полю:
 * подмена одного набора другим видна в любом из них.
 */
const RATES = {
  versionId: 'v7',
  baseRateAmd: 77_000,
  workScope: { TURNKEY: 1, FINISHING: 0.71, ROUGH: 0.46 },
  objectType: { APARTMENT: 1, HOUSE: 1.17 },
  condition: { NEW_BUILDING: 1, SECONDARY_WITH_DEMOLITION: 1.19 },
  ceilingHeight: { UP_TO_3M: 1, FROM_3M: 1.13 },
  rangeMin: 0.91,
  rangeMax: 1.16,
  validityDays: 30,
};

function respond(url: string): unknown {
  if (url.includes('/pricing/rates/versions')) return { items: [] };
  if (url.includes('/pricing/rates')) return RATES;
  return {};
}

beforeEach(() => {
  globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const body = respond(String(input));
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify(body),
      json: async () => body,
    });
  }) as unknown as typeof fetch;
});

describe('редактор ставок', () => {
  /**
   * Форма заполняется из ставок один раз, в инициализаторе состояния. Пока
   * ответ `/pricing/rates` в пути, `useRates` отдаёт значения по умолчанию —
   * и форма, смонтированная в этот момент, оставалась заполненной ими
   * навсегда. «Сохранить» тогда молча подменял действующий набор дефолтным.
   */
  it('заполняется действующими ставками, а не значениями по умолчанию', async () => {
    renderWithProviders(<App />, { route: '/admin/rates', user: makeUser({ role: 'ADMIN' }) });

    const baseRate = await screen.findByLabelText(/Базовая ставка/);
    await waitFor(() => {
      expect(baseRate).toHaveValue(77_000);
    });

    expect(screen.getByLabelText('Чистовая')).toHaveValue(0.71);
    expect(screen.getByLabelText('Черновая')).toHaveValue(0.46);
    expect(screen.getByLabelText('Частный дом')).toHaveValue(1.17);
    expect(screen.getByLabelText('Вторичка с демонтажом')).toHaveValue(1.19);
    expect(screen.getByLabelText('От 3 м')).toHaveValue(1.13);
    expect(screen.getByLabelText(/Нижняя граница/)).toHaveValue(0.91);
    expect(screen.getByLabelText(/Верхняя граница/)).toHaveValue(1.16);
  });

  it('до ответа о ставках полей редактирования не показывает', () => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(() => new Promise(() => undefined)) as unknown as typeof fetch;

    renderWithProviders(<App />, { route: '/admin/rates', user: makeUser({ role: 'ADMIN' }) });

    expect(screen.queryByLabelText(/Базовая ставка/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

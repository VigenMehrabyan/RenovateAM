import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { App } from '@/App';
import { AMD_SIGN } from '@/lib/format';
import { renderWithProviders } from './render';

const INPUT = {
  areaSqm: 80,
  objectType: 'APARTMENT',
  workScope: 'TURNKEY',
  finishPackage: 'STANDARD',
  condition: 'NEW_BUILDING',
  ceilingHeight: 'UP_TO_3M',
};

function storeEstimate(): void {
  window.sessionStorage.setItem(
    'renovateam.estimate',
    JSON.stringify({ input: INPUT, calculatedAt: '2026-08-23T10:00:00.000Z', token: 't1' }),
  );
}

/** Ставки, отличные от значений по умолчанию: подмена была бы заметна. */
const RATES = {
  versionId: 'v2',
  baseRateAmd: 90_000,
  workScope: { TURNKEY: 1, FINISHING: 0.6, ROUGH: 0.45 },
  objectType: { APARTMENT: 1, HOUSE: 1.15 },
  condition: { NEW_BUILDING: 1, SECONDARY_WITH_DEMOLITION: 1.15 },
  ceilingHeight: { UP_TO_3M: 1, FROM_3M: 1.1 },
  rangeMin: 0.85,
  rangeMax: 1.15,
  validityDays: 30,
};

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('экран результата', () => {
  it('не показывает сумму по ставкам по умолчанию, пока ответ о ставках в пути', async () => {
    // Запрос ставок «висит»: экран обязан ждать, а не показывать цифру,
    // которая через мгновение поменяется.
    globalThis.fetch = vi
      .fn()
      .mockImplementation(() => new Promise(() => undefined)) as unknown as typeof fetch;
    storeEstimate();

    renderWithProviders(<App />, { route: '/estimate' });

    expect(await screen.findByRole('status')).toBeInTheDocument();
    await waitFor(() => {
      expect(document.body.textContent).not.toContain(AMD_SIGN);
    });
  });

  it('показывает вилку по актуальной версии ставок, а не по значениям по умолчанию', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify(RATES),
      json: async () => RATES,
    }) as unknown as typeof fetch;
    storeEstimate();

    renderWithProviders(<App />, { route: '/estimate' });

    // 80 × 90 000 = 7 200 000 → 6 120 000 … 8 280 000
    expect(await screen.findByText(/6\s?120\s?000/)).toBeInTheDocument();
    expect(screen.getByText(/8\s?280\s?000/)).toBeInTheDocument();
    // Значение по умолчанию (60 000 за м²) на экране не появлялось.
    expect(screen.queryByText(/4\s?080\s?000/)).not.toBeInTheDocument();
  });
});

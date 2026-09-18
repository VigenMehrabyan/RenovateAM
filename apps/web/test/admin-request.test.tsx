import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { App } from '@/App';
import type { RequestResponse } from '@/lib/api-types';
import { makeUser, renderWithProviders } from './render';

const card: RequestResponse = {
  id: 'r1',
  number: 101,
  status: 'IN_PROGRESS',
  address: 'Ереван, Маштоца 10',
  needsManual: false,
  comment: null,
  createdAt: '2026-09-01T10:00:00Z',
  updatedAt: '2026-09-02T10:00:00Z',
  estimate: {
    id: 'e1',
    rateVersionId: 'v1',
    areaSqm: 80,
    objectType: 'APARTMENT',
    workScope: 'TURNKEY',
    finishPackage: 'STANDARD',
    condition: 'NEW_BUILDING',
    ceilingHeight: 'UP_TO_3M',
    amountBase: 4_800_000,
    amountMin: 4_080_000,
    amountMax: 5_520_000,
    needsManualReview: false,
    createdAt: '2026-09-01T10:00:00Z',
    expiresAt: '2026-10-01T10:00:00Z',
  },
  files: [],
  quote: null,
  decision: null,
  statusLog: [],
  client: {
    id: 'u1',
    fullName: 'Արամ Պետրոսյան',
    email: 'aram@example.am',
    phone: '+37411000001',
    address: 'Ереван, Абовяна 5',
  },
};

beforeEach(() => {
  globalThis.fetch = vi.fn().mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify(card),
      json: async () => card,
    }),
  ) as unknown as typeof fetch;
  window.sessionStorage.clear();
});

describe('карточка заявки в админке', () => {
  /**
   * Регрессия сквозного прогона: API клал параметры расчёта вложенно
   * (`estimate.input.*`), фронт читал их плоско — и сметчик видел
   * `calculator.objectTypeOptions.undefined` вместо «Квартира», а площадь
   * оставалась пустой.
   */
  it('параметры расчёта выводятся подписями, а не ключами i18n', async () => {
    renderWithProviders(<App />, {
      route: '/admin/requests/r1',
      user: makeUser({ role: 'ESTIMATOR' }),
    });

    expect(await screen.findByText('Квартира')).toBeInTheDocument();
    expect(screen.getByText('Под ключ')).toBeInTheDocument();
    expect(screen.getByText('Стандартный')).toBeInTheDocument();
    expect(screen.getByText('Новостройка')).toBeInTheDocument();
    expect(screen.getByText('80 м²')).toBeInTheDocument();
    expect(screen.queryByText(/calculator\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  it('адрес объекта берётся из заявки, а контактный — из профиля клиента', async () => {
    renderWithProviders(<App />, {
      route: '/admin/requests/r1',
      user: makeUser({ role: 'ESTIMATOR' }),
    });

    expect(await screen.findByText('Ереван, Маштоца 10')).toBeInTheDocument();
    expect(screen.getByText('Ереван, Абовяна 5')).toBeInTheDocument();
    expect(screen.getByText('Контактный адрес')).toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import type { QuickEstimateView, RequestResponse } from '@/lib/api-types';
import { makeUser, renderWithProviders } from './render';

const estimate: QuickEstimateView = {
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
};

function makeRequest(overrides: Partial<RequestResponse> = {}): RequestResponse {
  return {
    id: 'r1',
    number: 101,
    status: 'NEW',
    address: 'Ереван, Маштоца 10',
    needsManual: false,
    comment: null,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    estimate,
    files: [],
    quote: null,
    decision: null,
    ...overrides,
  };
}

/** Отдаёт заданный список на `/requests/me` и заявку по идентификатору. */
function mockApi(requests: RequestResponse[]): void {
  globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    let body: unknown = {};
    if (url.includes('/requests/me')) body = requests;
    else if (url.includes('/requests/')) {
      body = requests.find((item) => url.includes(item.id)) ?? requests[0];
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify(body),
      json: async () => body,
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('список заявок кабинета', () => {
  it('показывает строку с адресом, площадью, объёмом работ и статусом', async () => {
    mockApi([makeRequest()]);
    renderWithProviders(<App />, { route: '/cabinet', user: makeUser() });

    expect(await screen.findByText('Ереван, Маштоца 10')).toBeInTheDocument();
    expect(screen.getByText('Заявка № 101')).toBeInTheDocument();
    expect(screen.getByText('80 м²')).toBeInTheDocument();
    expect(screen.getByText('Под ключ')).toBeInTheDocument();
    expect(screen.getByText('Новая')).toBeInTheDocument();
  });

  it('порядок строк повторяет порядок ответа сервера — сортирует он', async () => {
    mockApi([
      makeRequest({ id: 'r2', number: 102, status: 'QUOTE_READY', address: 'Гюмри, Руставели 3' }),
      makeRequest({ id: 'r1', number: 101, status: 'NEW', address: 'Ереван, Маштоца 10' }),
    ]);
    renderWithProviders(<App />, { route: '/cabinet', user: makeUser() });

    await screen.findByText('Гюмри, Руставели 3');
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]!).getByText('Гюмри, Руставели 3')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Ереван, Маштоца 10')).toBeInTheDocument();
  });

  it('клиент без заявок получает приглашение посчитать вилку, а не «список пуст»', async () => {
    mockApi([]);
    renderWithProviders(<App />, { route: '/cabinet', user: makeUser() });

    expect(await screen.findByText('Заявок пока нет')).toBeInTheDocument();
    const invite = screen.getByRole('link', { name: 'Рассчитать стоимость' });
    expect(invite).toHaveAttribute('href', '/#calculator');
  });

  it('строка ведёт в карточку заявки', async () => {
    mockApi([makeRequest()]);
    renderWithProviders(<App />, { route: '/cabinet', user: makeUser() });

    await userEvent.click(await screen.findByRole('link', { name: /Ереван, Маштоца 10/ }));
    expect(await screen.findByRole('heading', { name: 'Ереван, Маштоца 10' })).toBeInTheDocument();
  });

  it('без пользователя запрос к его заявкам не уходит', () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      calls.push(String(input));
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => '[]',
        json: async () => [],
      });
    }) as unknown as typeof fetch;

    renderWithProviders(<App />, { route: '/cabinet', user: null });
    expect(calls.filter((url) => url.includes('/requests'))).toEqual([]);
  });
});

describe('карточка заявки в кабинете', () => {
  const withQuote = makeRequest({
    status: 'QUOTE_READY',
    quote: { id: 'q1', totalAmount: 5_000_000, createdAt: '2026-09-10T09:00:00Z' },
    statusLog: [
      {
        id: 's1',
        fromStatus: null,
        toStatus: 'NEW',
        comment: null,
        createdAt: '2026-09-01T10:00:00Z',
      },
      {
        id: 's2',
        fromStatus: 'NEW',
        toStatus: 'QUOTE_READY',
        comment: null,
        createdAt: '2026-09-10T09:00:00Z',
      },
    ],
  });

  it('при готовой смете показывает сумму, кнопку скачивания и историю статусов', async () => {
    mockApi([withQuote]);
    renderWithProviders(<App />, { route: '/cabinet/requests/r1', user: makeUser() });

    expect(await screen.findByText(/5 000 000/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Скачать смету (PDF)' })).toBeInTheDocument();
    expect(screen.queryByText('Смета ещё не загружена.')).not.toBeInTheDocument();
    expect(screen.getByText('Новая → Смета готова')).toBeInTheDocument();
  });

  /**
   * Регрессия: API отдавал параметры вложенно (`estimate.input.*`), фронт ждал
   * плоско — и вместо «Квартира» в карточке стоял ключ i18n.
   */
  it('параметры расчёта выводятся подписями, а не ключами', async () => {
    mockApi([withQuote]);
    renderWithProviders(<App />, { route: '/cabinet/requests/r1', user: makeUser() });

    expect(await screen.findByText('Квартира')).toBeInTheDocument();
    expect(screen.getByText('Под ключ')).toBeInTheDocument();
    expect(screen.getByText('80 м²')).toBeInTheDocument();
    expect(screen.queryByText(/calculator\./)).not.toBeInTheDocument();
  });

  it('дизайнерский пакет суммы не показывает', async () => {
    mockApi([
      makeRequest({
        estimate: {
          ...estimate,
          finishPackage: 'DESIGNER',
          needsManualReview: true,
          amountBase: null,
          amountMin: null,
          amountMax: null,
        },
      }),
    ]);
    renderWithProviders(<App />, { route: '/cabinet/requests/r1', user: makeUser() });

    expect(await screen.findByText('Дизайнерский')).toBeInTheDocument();
    expect(screen.queryByText(/֏/)).not.toBeInTheDocument();
  });
});

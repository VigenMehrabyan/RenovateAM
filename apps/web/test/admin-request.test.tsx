import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

/** Отдаёт карточку заявки на любой запрос. */
function mockCard(overrides: Partial<RequestResponse> = {}): void {
  const body = { ...card, ...overrides };
  globalThis.fetch = vi.fn().mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify(body),
      json: async () => body,
    }),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  mockCard();
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

  /**
   * Регрессия: сметчик выбирал «Смета готова» без загруженной сметы, получал
   * 409 и общий текст «Такой переход статуса запрещён». Теперь вариант
   * выключен заранее и подписан причиной.
   */
  it('без сметы статус «Смета готова» недоступен и объяснён', async () => {
    mockCard({ status: 'IN_PROGRESS', quote: null });
    renderWithProviders(<App />, {
      route: '/admin/requests/r1',
      user: makeUser({ role: 'ESTIMATOR' }),
    });

    const select = await screen.findByLabelText('Новый статус');
    const quoteReady = within(select).getByRole('option', { name: /Смета готова/ });
    expect(quoteReady).toBeDisabled();
    expect(quoteReady).toHaveTextContent('сметы ещё нет');
    expect(
      screen.getByText('Статус «Смета готова» недоступен: сначала загрузите PDF-смету выше.'),
    ).toBeInTheDocument();
    // По умолчанию выбран статус, который действительно доступен.
    expect((select as HTMLSelectElement).value).toBe('NEEDS_INFO');

    // Отправка невозможна: запроса на смену статуса не происходит.
    await userEvent.click(screen.getByRole('button', { name: 'Сменить статус' }));
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.some((call) => String(call[0]).includes('/status'))).toBe(false);
  });

  it('со сметой статус «Смета готова» доступен', async () => {
    mockCard({
      status: 'IN_PROGRESS',
      quote: { id: 'q1', totalAmount: 5_100_000, createdAt: '2026-09-03T10:00:00Z' },
    });
    renderWithProviders(<App />, {
      route: '/admin/requests/r1',
      user: makeUser({ role: 'ESTIMATOR' }),
    });

    const select = await screen.findByLabelText('Новый статус');
    expect(within(select).getByRole('option', { name: 'Смета готова' })).not.toBeDisabled();
    expect(screen.queryByText(/сначала загрузите PDF-смету/)).not.toBeInTheDocument();
  });

  /**
   * Регрессия: комментарий клиента к заявке выводился без подписи, и сметчик
   * принимал его за запись коллеги.
   */
  it('комментарий из заявки подписан как комментарий клиента', async () => {
    mockCard({ comment: 'Готово' });
    renderWithProviders(<App />, {
      route: '/admin/requests/r1',
      user: makeUser({ role: 'ESTIMATOR' }),
    });

    expect(await screen.findByText('Комментарий клиента к заявке')).toBeInTheDocument();
    expect(screen.getByText('Готово')).toBeInTheDocument();
    expect(screen.queryByText(/Комментарий сметчика/)).not.toBeInTheDocument();
  });
});

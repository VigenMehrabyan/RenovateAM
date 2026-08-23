import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { App } from '@/App';
import { makeUser, renderWithProviders } from './render';

beforeEach(() => {
  globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes('/admin/requests')
      ? { items: [], total: 0, page: 1, pageSize: 20 }
      : [];
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify(body),
      json: async () => body,
    });
  }) as unknown as typeof fetch;
  window.sessionStorage.clear();
});

describe('доступ к маршрутам', () => {
  it('неавторизованного с /cabinet отправляет на вход', async () => {
    renderWithProviders(<App />, { route: '/cabinet', user: null });
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
  });

  it('неавторизованного с /admin отправляет на вход', async () => {
    renderWithProviders(<App />, { route: '/admin', user: null });
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
  });

  it('клиента в админку не пускает', async () => {
    renderWithProviders(<App />, { route: '/admin', user: makeUser({ role: 'CLIENT' }) });
    expect(await screen.findByRole('heading', { name: 'Личный кабинет' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Очередь заявок' })).not.toBeInTheDocument();
  });

  it('сметчика в очередь пускает', async () => {
    renderWithProviders(<App />, { route: '/admin', user: makeUser({ role: 'ESTIMATOR' }) });
    expect(await screen.findByRole('heading', { name: 'Очередь заявок' })).toBeInTheDocument();
  });

  it('неверифицированному вместо кнопки отправки показывает баннер', async () => {
    renderWithProviders(<App />, {
      route: '/requests/new',
      user: makeUser({ emailVerified: false }),
    });

    expect(await screen.findByText('Подтвердите e-mail')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отправить заявку' })).not.toBeInTheDocument();
  });

  it('верифицированному кнопку отправки показывает', async () => {
    renderWithProviders(<App />, {
      route: '/requests/new',
      user: makeUser({ emailVerified: true }),
    });

    expect(await screen.findByRole('button', { name: 'Отправить заявку' })).toBeInTheDocument();
    expect(screen.queryByText('Подтвердите e-mail')).not.toBeInTheDocument();
  });

  it('гость видит калькулятор на лендинге', async () => {
    renderWithProviders(<App />, { route: '/', user: null });
    expect(await screen.findByRole('button', { name: 'Рассчитать' })).toBeInTheDocument();
  });
});

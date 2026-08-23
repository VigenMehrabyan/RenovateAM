import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { App } from '@/App';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import { CabinetPage } from '@/pages/CabinetPage';
import { AdminQueuePage } from '@/pages/admin/AdminQueuePage';
import i18n from '@/i18n';
import type { AuthUser } from '@/lib/api-types';
import { clearSession, getAccessToken, refreshAccessToken, setAccessToken } from '@/lib/http';
import { makeUser } from './render';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    headers: new Headers(),
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  window.sessionStorage.clear();
  setAccessToken(null);
});

describe('граница сессии', () => {
  /**
   * Экран кабинета смонтирован **без** гварда: так он гарантированно переживёт
   * выход и перерисуется уже без пользователя. Ровно это и происходило на
   * раннере — редирект гварда приходит следующим кадром, а наблюдатель
   * `useQuery` к этому моменту успевал завести запрос заново и вернуть в кеш
   * заявку предыдущего пользователя. Тест не зависит от скорости ответа:
   * мок отвечает мгновенно, а проверяется, что запроса не было вовсе.
   */
  it('после выхода экран с данными пользователя не перезапрашивает их', async () => {
    const alice = makeUser({ id: 'a', fullName: 'Alice' });
    const aliceRequest = {
      id: 'r-alice',
      number: 777,
      status: 'NEW',
      needsManual: false,
      comment: null,
      createdAt: '2026-08-20T10:00:00Z',
      updatedAt: '2026-08-20T10:00:00Z',
      estimate: null,
      files: [],
      quote: null,
      decision: null,
    };

    const calls: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/requests/me')) return Promise.resolve(jsonResponse([aliceRequest]));
      if (url.includes('/requests/')) return Promise.resolve(jsonResponse(aliceRequest));
      return Promise.resolve(jsonResponse({}));
    }) as unknown as typeof fetch;

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    const handle: { logout?: () => Promise<void> } = {};
    function Probe(): null {
      handle.logout = useAuth().logout;
      return null;
    }

    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/cabinet']}>
            <AuthProvider initialUser={alice} skipBootstrap>
              <Probe />
              <CabinetPage />
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText(/777/)).toBeInTheDocument();
    const requestCallsBefore = calls.filter((url) => url.includes('/requests')).length;
    expect(requestCallsBefore).toBeGreaterThan(0);

    await act(async () => {
      await handle.logout?.();
    });
    // Ещё один цикл: если бы наблюдатель остался включённым, запрос ушёл бы
    // именно на следующей перерисовке.
    await act(async () => {
      await Promise.resolve();
    });

    const requestCallsAfter = calls.filter((url) => url.includes('/requests')).length;
    expect(requestCallsAfter).toBe(requestCallsBefore);
    expect(queryClient.getQueryData(['requests', 'me'])).toBeUndefined();
  });

  /**
   * Тот же инвариант для второй двери в анонимное состояние — обработчика
   * `setSessionLostHandler` (401 + неудавшийся refresh). Он тоже сбрасывает
   * пользователя, пока экран с его данными смонтирован.
   */
  it('потеря сессии не оставляет наблюдателей, способных перезапросить данные', async () => {
    const aliceRequest = {
      id: 'r-alice',
      number: 777,
      status: 'NEW',
      needsManual: false,
      comment: null,
      createdAt: '2026-08-20T10:00:00Z',
      updatedAt: '2026-08-20T10:00:00Z',
      estimate: null,
      files: [],
      quote: null,
      decision: null,
    };

    const calls: string[] = [];
    let sessionAlive = true;
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (!sessionAlive)
        return Promise.resolve(jsonResponse({ error: { code: 'UNAUTHORIZED' } }, 401));
      if (url.includes('/requests/me')) return Promise.resolve(jsonResponse([aliceRequest]));
      if (url.includes('/requests/')) return Promise.resolve(jsonResponse(aliceRequest));
      return Promise.resolve(jsonResponse({}));
    }) as unknown as typeof fetch;

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });

    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/cabinet']}>
            <AuthProvider initialUser={makeUser({ id: 'a' })} skipBootstrap>
              <CabinetPage />
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText(/777/)).toBeInTheDocument();

    // Сессия умерла на сервере: следующий запрос получает 401, refresh тоже.
    sessionAlive = false;
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['requests', 'me'] });
    });

    const after = calls.length;
    await act(async () => {
      await Promise.resolve();
    });

    expect(calls.length).toBe(after);
    expect(queryClient.getQueryData(['requests', 'me'])).toBeUndefined();
    expect(getAccessToken()).toBeNull();
  });

  it('выход очищает кеш запросов: следующий пользователь не видит чужую заявку', async () => {
    const alice = makeUser({ id: 'a', fullName: 'Alice' });

    const aliceRequest = {
      id: 'r-alice',
      number: 777,
      status: 'NEW',
      needsManual: false,
      comment: null,
      createdAt: '2026-08-20T10:00:00Z',
      updatedAt: '2026-08-20T10:00:00Z',
      estimate: null,
      files: [],
      quote: null,
      decision: null,
    };

    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/requests/me')) return Promise.resolve(jsonResponse([aliceRequest]));
      if (url.includes('/requests/')) return Promise.resolve(jsonResponse(aliceRequest));
      return Promise.resolve(jsonResponse({}));
    }) as unknown as typeof fetch;

    const queryClient = new QueryClient({
      // staleTime как в проде: без сброса кеша данные Алисы переживут выход.
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });

    const handle: { logout?: () => Promise<void> } = {};
    function Probe(): null {
      handle.logout = useAuth().logout;
      return null;
    }

    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/cabinet']}>
            <AuthProvider initialUser={alice} skipBootstrap>
              <Probe />
              <App />
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText(/777/)).toBeInTheDocument();
    expect(queryClient.getQueryData(['requests', 'me'])).toBeDefined();

    await act(async () => {
      await handle.logout?.();
    });

    expect(queryClient.getQueryData(['requests', 'me'])).toBeUndefined();
    expect(getAccessToken()).toBeNull();
  });

  it('выход из админки не оставляет запрос очереди заявок', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      calls.push(String(input));
      return Promise.resolve(jsonResponse({ items: [], total: 0, page: 1, pageSize: 20 }));
    }) as unknown as typeof fetch;

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    const handle: { logout?: () => Promise<void> } = {};
    function Probe(): null {
      handle.logout = useAuth().logout;
      return null;
    }

    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/admin']}>
            <AuthProvider initialUser={makeUser({ role: 'ADMIN' })} skipBootstrap>
              <Probe />
              <AdminQueuePage />
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </I18nextProvider>,
    );

    await waitFor(() => expect(calls.some((u) => u.includes('/admin/requests'))).toBe(true));
    const before = calls.filter((u) => u.includes('/admin/')).length;

    await act(async () => {
      await handle.logout?.();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(calls.filter((u) => u.includes('/admin/')).length).toBe(before);
  });

  it('обновление токена, пришедшее после выхода, не возвращает access-токен в память', async () => {
    const refresh: { resolve?: (value: Response) => void } = {};
    globalThis.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          refresh.resolve = resolve;
        }),
    ) as unknown as typeof fetch;

    const pending = refreshAccessToken();

    // Пользователь вышел, пока запрос был в пути.
    clearSession();
    refresh.resolve?.(jsonResponse({ accessToken: 'late-token' }));

    await expect(pending).resolves.toBeNull();
    expect(getAccessToken()).toBeNull();
  });
});

describe('подтверждение e-mail', () => {
  function renderVerify(route: string, user: AuthUser | null): void {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({})) as unknown as typeof fetch;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>
            <AuthProvider initialUser={user} skipBootstrap>
              {children}
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </I18nextProvider>
    );
    render(<App />, { wrapper });
  }

  it('после регистрации кнопка повторной отправки ждёт 60 секунд', async () => {
    renderVerify('/verify?sent=1&email=aram%40example.am', makeUser({ emailVerified: false }));
    const button = await screen.findByRole('button', { name: /60/ });
    expect(button).toBeDisabled();
  });

  it('при переходе по баннеру «Подтвердите e-mail» кнопка доступна сразу', async () => {
    renderVerify('/verify', makeUser({ emailVerified: false }));
    const button = await screen.findByRole('button', { name: 'Отправить письмо повторно' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(globalThis.fetch).toHaveBeenCalled();
  });
});

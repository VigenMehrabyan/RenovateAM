import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { App } from '@/App';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';
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

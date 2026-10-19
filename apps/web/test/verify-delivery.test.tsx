import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { setAccessToken } from '@/lib/http';
import { makeUser, renderWithProviders } from './render';

/**
 * Честность интерфейса при отказе почтового канала.
 *
 * Раньше сервер отвечал «письмо отправлено» независимо от исхода, и экран
 * предлагал человеку проверить ящик, в который ничего не ушло. Теперь API
 * говорит правду (`emailVerificationSent: false` и 502 EMAIL_DELIVERY_FAILED),
 * а интерфейс показывает локализованный текст по коду.
 */

const FAILURE_TEXT = 'Письмо не удалось отправить. Попробуйте позже или напишите нам.';

function okResponse(body: unknown, status = 200): Response {
  return {
    ok: true,
    status,
    headers: new Headers(),
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

function errorResponse(code: string, status: number): Response {
  const body = { error: { code, message: 'mail channel refused', requestId: 'req-1' } };
  return {
    ok: false,
    status,
    headers: new Headers(),
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

/** Регистрация отвечает 201 с заданным исходом доставки письма. */
function mockRegister(emailVerificationSent: boolean): void {
  globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/auth/register')) {
      return Promise.resolve(okResponse({ userId: 'u1', emailVerificationSent }, 201));
    }
    if (url.includes('/auth/login')) {
      return Promise.resolve(
        okResponse({ accessToken: 'token', user: makeUser({ emailVerified: false }) }),
      );
    }
    return Promise.resolve(okResponse(makeUser({ emailVerified: false })));
  }) as unknown as typeof fetch;
}

async function fillAndSubmitRegistration(): Promise<void> {
  await userEvent.type(await screen.findByLabelText('ФИО'), 'Арам Петросян');
  await userEvent.type(screen.getByLabelText('E-mail'), 'aram@example.am');
  await userEvent.clear(screen.getByLabelText('Телефон'));
  await userEvent.type(screen.getByLabelText('Телефон'), '+37477123456');
  await userEvent.type(screen.getByLabelText('Адрес объекта'), 'Ереван, Абовяна 1');
  await userEvent.type(screen.getByLabelText('Пароль'), 'Password1');
  await userEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  setAccessToken(null);
});

describe('отказ почтового канала', () => {
  it('после регистрации без письма показывает честный текст, а не «письмо отправлено»', async () => {
    mockRegister(false);
    renderWithProviders(<App />, { route: '/register', user: null });

    await fillAndSubmitRegistration();

    expect(await screen.findByText(FAILURE_TEXT)).toBeInTheDocument();
    expect(screen.queryByText('Письмо отправлено')).not.toBeInTheDocument();
  });

  it('когда письмо ушло, остаётся сообщение об отправке', async () => {
    mockRegister(true);
    renderWithProviders(<App />, { route: '/register', user: null });

    await fillAndSubmitRegistration();

    expect(await screen.findByText('Письмо отправлено')).toBeInTheDocument();
    expect(screen.queryByText(FAILURE_TEXT)).not.toBeInTheDocument();
  });

  it('повторная отправка с 502 EMAIL_DELIVERY_FAILED показывает честный текст', async () => {
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/resend-verification')) {
        return Promise.resolve(errorResponse('EMAIL_DELIVERY_FAILED', 502));
      }
      return Promise.resolve(okResponse({}));
    }) as unknown as typeof fetch;

    renderWithProviders(<App />, {
      route: '/verify',
      user: makeUser({ emailVerified: false }),
    });

    const button = await screen.findByRole('button', { name: 'Отправить письмо повторно' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(await screen.findByText(FAILURE_TEXT)).toBeInTheDocument();
    // Ложного «письмо отправлено ещё раз» быть не должно.
    expect(screen.queryByText('Письмо отправлено ещё раз.')).not.toBeInTheDocument();
  });
});

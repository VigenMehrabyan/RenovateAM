import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { setAccessToken } from '@/lib/http';
import { renderWithProviders } from './render';

/**
 * Восстановление пароля в интерфейсе (US-10).
 *
 * Отдельно проверяется, что экран результата запроса письма НЕ сообщает,
 * нашёлся ли аккаунт: сервер отвечает одинаково на любой адрес, и интерфейс,
 * сказавший «такого адреса нет», вернул бы перечислитель аккаунтов, который
 * на сервере закрыт.
 */

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
  const body = { error: { code, message: 'reset token rejected', requestId: 'req-1' } };
  return {
    ok: false,
    status,
    headers: new Headers(),
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

/** `reset` — ответ эндпоинта /auth/reset-password: успех либо код ошибки. */
function mockApi(reset: { ok: true } | { code: string; status: number }): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/auth/forgot-password')) {
      return Promise.resolve(okResponse({ accepted: true }, 202));
    }
    if (url.includes('/auth/reset-password')) {
      return Promise.resolve(
        'ok' in reset ? okResponse({ reset: true }) : errorResponse(reset.code, reset.status),
      );
    }
    return Promise.resolve(okResponse({}));
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  setAccessToken(null);
});

describe('запрос письма восстановления', () => {
  it('со страницы входа ведёт ссылка «Забыли пароль?»', async () => {
    mockApi({ ok: true });
    renderWithProviders(<App />, { route: '/login', user: null });

    await userEvent.click(await screen.findByRole('link', { name: 'Забыли пароль?' }));

    expect(
      await screen.findByRole('heading', { name: 'Восстановление пароля' }),
    ).toBeInTheDocument();
  });

  it('после отправки показывает экран «письмо отправлено», не выдавая наличие аккаунта', async () => {
    const fetchMock = mockApi({ ok: true });
    renderWithProviders(<App />, { route: '/forgot', user: null });

    await userEvent.type(await screen.findByLabelText('E-mail'), 'aram@example.am');
    await userEvent.click(screen.getByRole('button', { name: 'Отправить ссылку' }));

    expect(await screen.findByText('Письмо отправлено')).toBeInTheDocument();
    expect(screen.getByText(/Если аккаунт на aram@example\.am существует/)).toBeInTheDocument();
    // Запрос ушёл с нормализованным адресом в теле.
    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/auth/forgot-password'),
    );
    expect(call).toBeDefined();
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({
      email: 'aram@example.am',
    });
  });

  it('пустой или неверный адрес не уходит на сервер', async () => {
    const fetchMock = mockApi({ ok: true });
    renderWithProviders(<App />, { route: '/forgot', user: null });

    await userEvent.type(await screen.findByLabelText('E-mail'), 'не-адрес');
    await userEvent.click(screen.getByRole('button', { name: 'Отправить ссылку' }));

    expect(await screen.findByText('Некорректный e-mail')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/forgot-password')),
    ).toHaveLength(0);
  });
});

describe('страница установки нового пароля', () => {
  it('по хорошей ссылке меняет пароль и отправляет на вход', async () => {
    const fetchMock = mockApi({ ok: true });
    renderWithProviders(<App />, { route: '/reset?token=good-long-token', user: null });

    await userEvent.type(await screen.findByLabelText('Пароль'), 'NewPassword9');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'NewPassword9');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));

    expect(await screen.findByText('Пароль изменён')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'К входу' })).toBeInTheDocument();

    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/auth/reset-password'));
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({
      token: 'good-long-token',
      password: 'NewPassword9',
    });

    // Ссылка «К входу» действительно уводит на вход.
    await userEvent.click(screen.getByRole('link', { name: 'К входу' }));
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
  });

  it('несовпадающие пароли не уходят на сервер', async () => {
    const fetchMock = mockApi({ ok: true });
    renderWithProviders(<App />, { route: '/reset?token=good-long-token', user: null });

    await userEvent.type(await screen.findByLabelText('Пароль'), 'NewPassword9');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'NewPassword8');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));

    expect(await screen.findByText('Пароли не совпадают')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/reset-password')),
    ).toHaveLength(0);
  });

  it('слабый пароль отклоняется теми же правилами, что при регистрации', async () => {
    mockApi({ ok: true });
    renderWithProviders(<App />, { route: '/reset?token=good-long-token', user: null });

    await userEvent.type(await screen.findByLabelText('Пароль'), 'onlyletters');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'onlyletters');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));

    expect(await screen.findByText('Нужны хотя бы одна буква и одна цифра')).toBeInTheDocument();
  });

  it('истёкшая ссылка → честный текст и предложение запросить новую', async () => {
    mockApi({ code: 'TOKEN_EXPIRED', status: 410 });
    renderWithProviders(<App />, { route: '/reset?token=stale-long-token', user: null });

    await userEvent.type(await screen.findByLabelText('Пароль'), 'NewPassword9');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'NewPassword9');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));

    expect(await screen.findByText('Срок действия ссылки истёк')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Запросить новую ссылку' })).toBeInTheDocument();
    // Формы больше нет: вводить пароль в мёртвую ссылку бессмысленно.
    expect(screen.queryByRole('button', { name: 'Сохранить пароль' })).not.toBeInTheDocument();
  });

  it('использованная ссылка → «Ссылка уже использована»', async () => {
    mockApi({ code: 'TOKEN_ALREADY_USED', status: 409 });
    renderWithProviders(<App />, { route: '/reset?token=used-long-token', user: null });

    await userEvent.type(await screen.findByLabelText('Пароль'), 'NewPassword9');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'NewPassword9');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));

    expect(await screen.findByText('Ссылка уже использована')).toBeInTheDocument();
  });

  it('недействительная ссылка → «Ссылка недействительна»', async () => {
    mockApi({ code: 'TOKEN_INVALID', status: 400 });
    renderWithProviders(<App />, { route: '/reset?token=bogus-long-token', user: null });

    await userEvent.type(await screen.findByLabelText('Пароль'), 'NewPassword9');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'NewPassword9');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));

    expect(await screen.findByText('Ссылка недействительна')).toBeInTheDocument();
  });

  it('адрес без токена вообще не показывает форму', async () => {
    mockApi({ ok: true });
    renderWithProviders(<App />, { route: '/reset', user: null });

    expect(await screen.findByText('Ссылка неполная')).toBeInTheDocument();
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Запросить новую ссылку' })).toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { setAccessToken } from '@/lib/http';
import { renderWithProviders } from './render';

/**
 * Переключатель видимости пароля (US-9).
 *
 * Проверяется ровно то, что ломается на практике: тип поля, доступное имя
 * кнопки и то, что кнопка не отправляет форму. Последнее — главная ловушка:
 * `<button>` внутри формы по умолчанию отправляет её, и «посмотреть пароль»
 * превращалось бы в попытку входа с недонабранным паролем.
 */

/** Запросов на этих экранах не ждём, но fetch должен существовать. */
function mockFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => '{}',
      json: async () => ({}),
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  setAccessToken(null);
});

describe('показать / скрыть пароль', () => {
  it('на входе переключает тип поля и доступное имя кнопки', async () => {
    mockFetch();
    renderWithProviders(<App />, { route: '/login', user: null });

    const field = await screen.findByLabelText('Пароль');
    expect(field).toHaveAttribute('type', 'password');

    const show = screen.getByRole('button', { name: 'Показать пароль' });
    expect(show).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(show);

    expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'text');
    const hide = screen.getByRole('button', { name: 'Скрыть пароль' });
    expect(hide).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Показать пароль' })).not.toBeInTheDocument();

    await userEvent.click(hide);

    expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Показать пароль' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('кнопка переключателя не отправляет форму', async () => {
    const fetchMock = mockFetch();
    renderWithProviders(<App />, { route: '/login', user: null });

    const toggle = await screen.findByRole('button', { name: 'Показать пароль' });

    await userEvent.type(screen.getByLabelText('E-mail'), 'aram@example.am');
    await userEvent.type(screen.getByLabelText('Пароль'), 'Password1');
    await userEvent.click(toggle);

    // Ни одного запроса: форма не отправлялась.
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/login')),
    ).toHaveLength(0);
    // И валидация не запускалась — на экране нет ошибок полей.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Причина — настоящий type="button", а не перехват события.
    expect(toggle).toHaveAttribute('type', 'button');
  });

  it('значение поля при переключении не теряется и поле не пересоздаётся', async () => {
    mockFetch();
    renderWithProviders(<App />, { route: '/login', user: null });

    const field = await screen.findByLabelText('Пароль');
    await userEvent.type(field, 'Password1');
    await userEvent.click(screen.getByRole('button', { name: 'Показать пароль' }));

    // Тот же самый DOM-узел с тем же `autocomplete`: автозаполнение браузера
    // и менеджеры паролей опираются именно на это.
    const after = screen.getByLabelText('Пароль');
    expect(after).toBe(field);
    expect(after).toHaveValue('Password1');
    expect(after).toHaveAttribute('autocomplete', 'current-password');
    expect(after).toHaveAttribute('name', 'password');
  });

  it('на регистрации переключатель тоже есть', async () => {
    mockFetch();
    renderWithProviders(<App />, { route: '/register', user: null });

    const field = await screen.findByLabelText('Пароль');
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Показать пароль' }));
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'text');
  });

  it('состояние сбрасывается при переходе на другую страницу', async () => {
    mockFetch();
    renderWithProviders(<App />, { route: '/login', user: null });

    await userEvent.click(await screen.findByRole('button', { name: 'Показать пароль' }));
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'text');

    // Уходим на регистрацию и возвращаемся — пароль снова скрыт.
    await userEvent.click(screen.getByRole('link', { name: 'Зарегистрироваться' }));
    expect(await screen.findByRole('heading', { name: 'Регистрация' })).toBeInTheDocument();
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('link', { name: 'Войти' }));
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'password');
  });

  it('иконка — инлайновый SVG, а не текст или эмодзи', async () => {
    mockFetch();
    renderWithProviders(<App />, { route: '/login', user: null });

    const toggle = await screen.findByRole('button', { name: 'Показать пароль' });
    const svg = toggle.querySelector('svg');
    expect(svg).not.toBeNull();
    // Знак декоративный: имя кнопке даёт aria-label, а не содержимое.
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(toggle.textContent).toBe('');
  });
});

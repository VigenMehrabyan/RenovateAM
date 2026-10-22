import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { installChatMock } from '@/features/chat/mock/chat-mock-server';
import type { ChatMockServer } from '@/features/chat/mock/chat-mock-server';
import { makeUser, renderWithProviders } from './render';

/**
 * Админские экраны чата (docs/CHAT.md §5.2, §7.4) против того же мок-слоя,
 * что и виджет: лид в списке появляется ровно после того, как разговор его
 * создал, — отдельных фикстур нет, и список не может разойтись с контрактом.
 */
let mock: { server: ChatMockServer; restore: () => void };
const STAFF = makeUser({ role: 'ESTIMATOR' });

beforeEach(() => {
  window.sessionStorage.clear();
  mock = installChatMock();
});

afterEach(() => {
  mock.restore();
});

/** Проводит разговор через API: вопрос, контакты — получается лид. */
async function seedLead(): Promise<string> {
  const created = (await (
    await mock.server.fetch('/api/v1/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ locale: 'RU' }),
    })
  ).json()) as { sessionId: string };

  await mock.server.fetch(`/api/v1/chat/sessions/${created.sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text: 'Сколько стоит ремонт 60 м² под ключ?' }),
  });
  await mock.server.fetch(`/api/v1/chat/sessions/${created.sessionId}/contacts`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Ани', email: 'ani@example.am', phone: '099099457' }),
  });
  return created.sessionId;
}

describe('админка: список лидов из чата', () => {
  it('показывает лид с контактами и первым вопросом', async () => {
    await seedLead();
    renderWithProviders(<App />, { route: '/admin/chat', user: STAFF });

    expect(await screen.findByRole('heading', { name: 'Лиды из чата' })).toBeInTheDocument();
    const row = (await screen.findByRole('link', { name: 'Ани' })).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('+37499099457')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('ani@example.am')).toBeInTheDocument();
    expect(
      within(row as HTMLElement).getByText('Сколько стоит ремонт 60 м² под ключ?'),
    ).toBeInTheDocument();
  });

  it('анонимный разговор без контактов в список не попадает', async () => {
    const created = (await (
      await mock.server.fetch('/api/v1/chat/sessions', {
        method: 'POST',
        body: JSON.stringify({ locale: 'RU' }),
      })
    ).json()) as { sessionId: string };
    await mock.server.fetch(`/api/v1/chat/sessions/${created.sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Сколько стоит?' }),
    });

    renderWithProviders(<App />, { route: '/admin/chat', user: STAFF });

    expect(
      await screen.findByText('Лидов по этим условиям нет.', undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
  });
});

describe('админка: разговор целиком', () => {
  it('показывает переписку и отмечает лид обработанным', async () => {
    const id = await seedLead();
    renderWithProviders(<App />, { route: `/admin/chat/${id}`, user: STAFF });

    expect(
      await screen.findByRole('heading', { name: 'Разговор из чата' }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Сколько стоит ремонт 60 м² под ключ?')).toBeInTheDocument();
    expect(screen.getAllByText('Посетитель').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Бот').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Обработан' }));

    expect(
      await screen.findByText('Лид отмечен обработанным', undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Обработан' })).not.toBeInTheDocument();
  });
});

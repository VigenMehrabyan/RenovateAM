import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import type { CommentView, RequestResponse } from '@/lib/api-types';
import { makeUser, renderWithProviders } from './render';

function makeComment(overrides: Partial<CommentView> = {}): CommentView {
  return {
    id: 'c1',
    author: { id: 'u1', name: 'Ани Саргсян', role: 'CLIENT' },
    text: 'Плана БТИ нет на руках, есть только фото стен',
    createdAt: '2026-09-01T10:00:00Z',
    files: [],
    ...overrides,
  };
}

function makeRequest(overrides: Partial<RequestResponse> = {}): RequestResponse {
  return {
    id: 'r1',
    number: 101,
    status: 'IN_PROGRESS',
    address: 'Ереван, Маштоца 10',
    needsManual: false,
    comment: null,
    createdAt: '2026-09-01T09:00:00Z',
    updatedAt: '2026-09-02T09:00:00Z',
    estimate: null,
    files: [],
    quote: null,
    decision: null,
    statusLog: [],
    comments: [],
    ...overrides,
  };
}

interface Call {
  url: string;
  method: string;
  body: unknown;
}

let calls: Call[] = [];

/** Отдаёт карточку заявки и записывает отправленные сообщения. */
function mockApi(request: RequestResponse, options: { failPost?: boolean } = {}): void {
  calls = [];
  globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({
      url,
      method,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });

    if (method === 'POST' && url.includes('/comments')) {
      if (options.failPost) {
        const error = {
          error: { code: 'INTERNAL_ERROR', message: 'boom', requestId: 'x' },
        };
        return Promise.resolve({
          ok: false,
          status: 500,
          headers: new Headers(),
          text: async () => JSON.stringify(error),
          json: async () => error,
        });
      }
      return Promise.resolve({
        ok: true,
        status: 201,
        headers: new Headers(),
        text: async () => JSON.stringify(makeComment({ id: 'new' })),
        json: async () => makeComment({ id: 'new' }),
      });
    }

    const body = url.includes('/requests/me') ? [request] : request;
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

describe('лента обсуждения в кабинете', () => {
  it('показывает сообщения обеих сторон с автором, ролью и временем', async () => {
    mockApi(
      makeRequest({
        comments: [
          makeComment(),
          makeComment({
            id: 'c2',
            author: { id: 's1', name: 'Гор Петросян', role: 'ESTIMATOR' },
            text: 'Пришлите, пожалуйста, поэтажный план',
            createdAt: '2026-09-01T12:00:00Z',
          }),
        ],
      }),
    );
    renderWithProviders(<App />, { route: '/cabinet/requests/r1', user: makeUser() });

    expect(await screen.findByText(/Плана БТИ нет на руках/)).toBeInTheDocument();
    expect(screen.getByText(/поэтажный план/)).toBeInTheDocument();
    expect(screen.getByText('Ани Саргсян')).toBeInTheDocument();
    expect(screen.getByText('Гор Петросян')).toBeInTheDocument();
    expect(screen.getByText('Клиент')).toBeInTheDocument();
    expect(screen.getByText('Сметчик')).toBeInTheDocument();
  });

  it('удалённая учётная запись не стирает сообщение: остаётся роль и дата', async () => {
    mockApi(
      makeRequest({
        comments: [
          makeComment({
            author: { id: null, name: null, role: 'ESTIMATOR' },
            text: 'Смета будет завтра',
          }),
        ],
      }),
    );
    renderWithProviders(<App />, { route: '/cabinet/requests/r1', user: makeUser() });

    expect(await screen.findByText('Смета будет завтра')).toBeInTheDocument();
    expect(screen.getByText('Учётная запись удалена')).toBeInTheDocument();
    expect(screen.getByText('Сметчик')).toBeInTheDocument();
  });

  it('пустая лента объясняет, зачем она нужна', async () => {
    mockApi(makeRequest());
    renderWithProviders(<App />, { route: '/cabinet/requests/r1', user: makeUser() });

    expect(await screen.findByText('Сообщений пока нет')).toBeInTheDocument();
    expect(screen.getByText(/дошлите недостающий файл/)).toBeInTheDocument();
  });

  it('счётчик символов виден заранее и следует за вводом', async () => {
    mockApi(makeRequest());
    renderWithProviders(<App />, { route: '/cabinet/requests/r1', user: makeUser() });

    const field = await screen.findByLabelText('Новое сообщение');
    // Счётчик показан до того, как предел стал близок.
    expect(screen.getByText('0 из 4000 символов')).toBeInTheDocument();
    expect(field).toHaveAttribute('maxlength', '4000');

    await userEvent.type(field, 'Спасибо');
    expect(screen.getByText('7 из 4000 символов')).toBeInTheDocument();
  });

  it('отправляет сообщение и очищает поле', async () => {
    mockApi(makeRequest());
    renderWithProviders(<App />, { route: '/cabinet/requests/r1', user: makeUser() });

    const field = await screen.findByLabelText('Новое сообщение');
    const send = screen.getByRole('button', { name: 'Отправить' });
    // Пустое сообщение отправить нельзя.
    expect(send).toBeDisabled();

    await userEvent.type(field, 'Высылаю фото');
    await userEvent.click(send);

    await waitFor(() => expect(field).toHaveValue(''));
    const posted = calls.find((call) => call.method === 'POST');
    expect(posted?.url).toContain('/requests/r1/comments');
    expect(posted?.body).toEqual({ text: 'Высылаю фото' });
  });

  it('при неудачной отправке текст остаётся в поле', async () => {
    mockApi(makeRequest(), { failPost: true });
    renderWithProviders(<App />, { route: '/cabinet/requests/r1', user: makeUser() });

    const field = await screen.findByLabelText('Новое сообщение');
    await userEvent.type(field, 'Важный вопрос');
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(await screen.findByText(/Внутренняя ошибка сервера/)).toBeInTheDocument();
    expect(field).toHaveValue('Важный вопрос');
  });

  it('у отклонённой заявки лента только для чтения', async () => {
    mockApi(makeRequest({ status: 'REJECTED', comments: [makeComment()] }));
    renderWithProviders(<App />, { route: '/cabinet/requests/r1', user: makeUser() });

    expect(await screen.findByText(/Плана БТИ нет на руках/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Новое сообщение')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отправить' })).not.toBeInTheDocument();
    expect(screen.getByText(/новых сообщений не принимает/)).toBeInTheDocument();
  });

  it('у закрытой принятой заявки лента остаётся рабочей', async () => {
    mockApi(
      makeRequest({
        status: 'ACCEPTED',
        decision: {
          result: 'ACCEPTED',
          reason: null,
          comment: null,
          createdAt: '2026-09-03T10:00:00Z',
        },
      }),
    );
    renderWithProviders(<App />, { route: '/cabinet/requests/r1', user: makeUser() });

    expect(await screen.findByLabelText('Новое сообщение')).toBeInTheDocument();
  });

  it('файл из переписки виден в списке файлов заявки с пометкой', async () => {
    mockApi(
      makeRequest({
        files: [
          {
            id: 'f1',
            kind: 'BTI',
            originalName: 'plan.pdf',
            mime: 'application/pdf',
            size: 1024,
            uploadedAt: '2026-09-01T10:00:00Z',
            source: 'REQUEST',
          },
          {
            id: 'f2',
            kind: 'BTI',
            originalName: 'stena.jpg',
            mime: 'image/jpeg',
            size: 2048,
            uploadedAt: '2026-09-02T10:00:00Z',
            source: 'DISCUSSION',
          },
        ],
      }),
    );
    renderWithProviders(<App />, { route: '/cabinet/requests/r1', user: makeUser() });

    const files = await screen.findByText('stena.jpg');
    expect(files).toBeInTheDocument();
    expect(screen.getByText('Из обсуждения')).toBeInTheDocument();
    expect(screen.getByText('Приложен к заявке')).toBeInTheDocument();
  });
});

describe('лента обсуждения в админке', () => {
  it('сметчик отвечает из карточки заявки, а не из другого места', async () => {
    mockApi(makeRequest({ comments: [makeComment()] }));
    renderWithProviders(<App />, {
      route: '/admin/requests/r1',
      user: makeUser({ role: 'ESTIMATOR' }),
    });

    expect(await screen.findByText(/Плана БТИ нет на руках/)).toBeInTheDocument();

    const field = screen.getByLabelText('Новое сообщение');
    await userEvent.type(field, 'Нужен поэтажный план');
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    await waitFor(() => {
      const posted = calls.find((call) => call.method === 'POST');
      expect(posted?.url).toContain('/requests/r1/comments');
      expect(posted?.body).toEqual({ text: 'Нужен поэтажный план' });
    });
  });

  it('вложение сообщения доступно на скачивание', async () => {
    mockApi(
      makeRequest({
        comments: [
          makeComment({
            files: [
              {
                id: 'f2',
                kind: 'BTI',
                originalName: 'stena.jpg',
                mime: 'image/jpeg',
                size: 2048,
                uploadedAt: '2026-09-02T10:00:00Z',
              },
            ],
          }),
        ],
      }),
    );
    renderWithProviders(<App />, {
      route: '/admin/requests/r1',
      user: makeUser({ role: 'ESTIMATOR' }),
    });

    const message = (await screen.findByText(/Плана БТИ нет на руках/)).closest('li');
    expect(message).not.toBeNull();
    expect(within(message as HTMLElement).getByText('stena.jpg')).toBeInTheDocument();
    expect(
      within(message as HTMLElement).getByRole('button', { name: 'Скачать' }),
    ).toBeInTheDocument();
  });
});

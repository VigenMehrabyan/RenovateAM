import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import i18n from '@/i18n';
import type { RequestResponse } from '@/lib/api-types';
import { makeUser, renderWithProviders } from './render';

/**
 * Сорвавшаяся загрузка файла.
 *
 * Прод работал с STORAGE_DRIVER=memory: `upload-url` отдавал адрес
 * `memory://…`, PUT по нему невозможен, `confirm` не вызывался — и заявка
 * уходила без вложения, а клиент видел «заявка отправлена». Отказ обязан быть
 * виден, а отправка — не состояться.
 */

/** Адрес, который выдавало хранилище в памяти: загрузить по нему нельзя. */
const MEMORY_UPLOAD_URL = 'memory://upload/requests/u1/bti/f1.pdf?expires=900';

/** Заявка клиента: нужна карточке с обсуждением. */
const REQUEST: RequestResponse = {
  id: 'r1',
  number: 101,
  status: 'IN_PROGRESS',
  address: 'Ереван, Маштоца 10',
  needsManual: false,
  comment: null,
  createdAt: '2026-09-01T10:00:00Z',
  updatedAt: '2026-09-02T10:00:00Z',
  estimate: null,
  files: [],
  quote: null,
  decision: null,
  statusLog: [],
  comments: [],
};

const fetchSpy = vi.fn();

/** XHR, который падает на отправке, — как браузер на схеме memory://. */
class FailingXhr {
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  status = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(): void {}
  setRequestHeader(): void {}
  abort(): void {}
  send(): void {
    setTimeout(() => this.onerror?.(), 0);
  }
  addEventListener(): void {}
}

const RealXhr = globalThis.XMLHttpRequest;

beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockImplementation((input: RequestInfo | URL) => {
    const address = String(input);
    const body = address.includes('/files/upload-url')
      ? {
          fileId: 'f1',
          uploadUrl: MEMORY_UPLOAD_URL,
          expiresAt: '2026-10-19T12:00:00Z',
          requiredHeaders: {},
        }
      : address.includes('/requests/r1')
        ? REQUEST
        : {};
    return Promise.resolve({
      ok: true,
      status: address.includes('/files/upload-url') ? 201 : 200,
      headers: new Headers(),
      text: async () => JSON.stringify(body),
      json: async () => body,
    });
  });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  globalThis.XMLHttpRequest = FailingXhr as unknown as typeof XMLHttpRequest;
  window.sessionStorage.clear();
});

afterEach(async () => {
  globalThis.XMLHttpRequest = RealXhr;
  await i18n.changeLanguage('ru');
});

/** Прикладывает план БТИ и ждёт, пока загрузка сорвётся. */
async function attachFailingFile(): Promise<void> {
  const file = new File(['%PDF-1.4'], 'plan.pdf', { type: 'application/pdf' });
  // Поле спрятано визуально (sr-only), но имя у него есть — тем же именем
  // подписана и секция, поэтому сужаем поиск до самого input.
  const input = await screen.findByLabelText(i18n.t('request.files.btiTitle'), {
    selector: 'input[type="file"]',
  });
  await userEvent.upload(input, file);
  await waitFor(() => expect(screen.getAllByText('plan.pdf').length).toBeGreaterThan(0));
}

describe('сорвавшаяся загрузка файла', () => {
  it.each(['ru', 'hy', 'en'])('отказ виден в локали %s', async (locale) => {
    await i18n.changeLanguage(locale);
    renderWithProviders(<App />, { route: '/requests/new', user: makeUser() });
    await attachFailingFile();

    // Текст берётся из словаря: в каждой локали он свой и непустой.
    const failed = i18n.t('request.files.failed');
    const explanation = i18n.t('request.files.errors.network');
    expect(explanation).not.toBe('request.files.errors.network');

    await waitFor(() => expect(screen.getAllByText(failed).length).toBeGreaterThan(0));
    expect(screen.getByText(explanation)).toBeInTheDocument();
  });

  it('заявка с несостоявшейся загрузкой не отправляется', async () => {
    renderWithProviders(<App />, { route: '/requests/new', user: makeUser() });
    await attachFailingFile();

    await waitFor(() => expect(screen.getAllByText('Ошибка загрузки').length).toBeGreaterThan(0));

    await userEvent.click(screen.getByRole('button', { name: 'Отправить заявку' }));

    // Ни запроса на создание заявки, ни перехода на карточку «отправлено».
    await waitFor(() =>
      expect(
        screen.getByText(
          'Часть файлов не загрузилась. Удалите их из списка и загрузите заново: иначе заявка уйдёт без вложений.',
        ),
      ).toBeInTheDocument(),
    );
    const created = fetchSpy.mock.calls.filter(
      (call) => String(call[0]).endsWith('/requests') && call[1]?.method === 'POST',
    );
    expect(created).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Отправить заявку' })).toBeInTheDocument();
  });

  /** Симптом из боевых логов: `upload-url` был, `confirm` — нет. */
  it('подтверждения загрузки не было: файл в хранилище не оказался', async () => {
    renderWithProviders(<App />, { route: '/requests/new', user: makeUser() });
    await attachFailingFile();

    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some((call) => String(call[0]).includes('/files/upload-url')),
      ).toBe(true),
    );
    expect(fetchSpy.mock.calls.some((call) => String(call[0]).includes('/confirm'))).toBe(false);
  });
});

describe('сорвавшаяся загрузка вложения в обсуждении', () => {
  it('отказ виден, и сообщение без вложения не уходит', async () => {
    renderWithProviders(<App />, { route: '/cabinet/requests/r1', user: makeUser() });

    const input = await screen.findByLabelText('Приложить файл', {
      selector: 'input[type="file"]',
    });
    await userEvent.upload(
      input,
      new File(['%PDF-1.4'], 'scheme.pdf', { type: 'application/pdf' }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          'Файл не загрузился в хранилище. Удалите его и попробуйте снова — отправленная заявка такой файл не получит.',
        ),
      ).toBeInTheDocument(),
    );
    // Кнопка отправки закрыта: «вот чертёж» без чертежа отправить нельзя.
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled();
    expect(fetchSpy.mock.calls.some((call) => String(call[0]).includes('/comments'))).toBe(false);
  });
});

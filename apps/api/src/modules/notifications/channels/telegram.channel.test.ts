import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationEvent } from '../public';
import { TELEGRAM_TIMEOUT_MS, TelegramChannel, renderTelegramMessage } from './telegram.channel';

const LEAD: Extract<NotificationEvent, { type: 'CHAT_LEAD' }> = {
  type: 'CHAT_LEAD',
  to: 'manager@renovateam.am',
  locale: 'RU',
  name: 'Ани',
  phone: '+37499099457',
  email: 'ani@example.com',
  question: 'сколько стоит ремонт 60 м² под ключ',
  adminLink: 'https://renovateam.am/admin/chat/0b2f',
};

const HANDOFF: Extract<NotificationEvent, { type: 'CHAT_HANDOFF' }> = {
  type: 'CHAT_HANDOFF',
  to: 'manager@renovateam.am',
  locale: 'RU',
  name: '',
  phone: '',
  question: 'хочу поговорить с человеком',
  adminLink: 'https://renovateam.am/admin/chat/0b2f',
};

describe('текст сообщения в Telegram', () => {
  it('формат из контракта: заголовок, контакт, вопрос, ссылка', () => {
    expect(renderTelegramMessage(LEAD)).toBe(
      [
        '🔔 Новый лид из чата',
        'Ани · +37499099457',
        'Спрашивала: сколько стоит ремонт 60 м² под ключ',
        '→ https://renovateam.am/admin/chat/0b2f',
      ].join('\n'),
    );
  });

  it('переписка целиком не уходит: только первый вопрос и ссылка', () => {
    const text = renderTelegramMessage(LEAD);
    expect(text).not.toContain('ani@example.com');
    expect(text.split('\n')).toHaveLength(4);
  });

  it('перевод строки внутри вопроса не ломает формат', () => {
    const text = renderTelegramMessage({
      ...LEAD,
      question: 'сколько стоит\n\nи когда закончите',
    });
    expect(text.split('\n')).toHaveLength(4);
    expect(text).toContain('сколько стоит и когда закончите');
  });

  it('без контактов — явная строка, а не пустая', () => {
    expect(renderTelegramMessage(HANDOFF)).toContain('Контактов нет');
    expect(renderTelegramMessage(HANDOFF)).toContain('🙋');
  });

  it('язык сообщения — язык разговора', () => {
    expect(renderTelegramMessage({ ...LEAD, locale: 'HY' })).toContain('Նոր հայտ չատից');
    expect(renderTelegramMessage({ ...LEAD, locale: 'EN' })).toContain('New chat lead');
  });

  it('вопроса нет — так и сказано', () => {
    expect(renderTelegramMessage({ ...LEAD, question: '' })).toContain('Вопрос не задан');
  });
});

describe('канал Telegram', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('берёт только события чата', () => {
    const channel = new TelegramChannel('token', '-100500');
    expect(channel.supports(LEAD)).toBe(true);
    expect(channel.supports(HANDOFF)).toBe(true);
    expect(
      channel.supports({
        type: 'EMAIL_VERIFICATION',
        to: 'client@example.com',
        locale: 'RU',
        link: 'https://renovateam.am/verify?token=x',
      }),
    ).toBe(false);
  });

  it('POST на sendMessage с chat_id и выключенным превью', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const channel = new TelegramChannel('bot-token', '-100500');

    await channel.send(LEAD);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.telegram.org/botbot-token/sendMessage');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.chat_id).toBe('-100500');
    expect(body.disable_web_page_preview).toBe(true);
    expect(String(body.text)).toContain('→ https://renovateam.am/admin/chat/0b2f');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('ответ не 2xx — ошибка канала, а не тихий успех', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    const channel = new TelegramChannel('bot-token', '-100500');
    await expect(channel.send(LEAD)).rejects.toThrow(/HTTP 403/);
  });

  it('запрос обрывается по таймауту 5 секунд', async () => {
    vi.useFakeTimers();
    // Канал ждёт ответа, которого не будет; сигнал обрывает запрос сам.
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const channel = new TelegramChannel('bot-token', '-100500');

    const sending = channel.send(LEAD);
    const assertion = expect(sending).rejects.toThrow(
      new RegExp(`нет ответа за ${TELEGRAM_TIMEOUT_MS} мс`),
    );
    await vi.advanceTimersByTimeAsync(TELEGRAM_TIMEOUT_MS + 1);
    await assertion;
    vi.useRealTimers();
  });

  it('чужое событие канал не отправляет даже при прямом вызове', async () => {
    const channel = new TelegramChannel('bot-token', '-100500');
    await expect(
      channel.send({
        type: 'QUOTE_READY',
        to: 'client@example.com',
        locale: 'RU',
        requestNumber: 7,
      }),
    ).rejects.toThrow(/не поддерживается/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { Injectable, Logger } from '@nestjs/common';
import type { Locale } from '@db/enums';
import type { NotificationEvent } from '../public';
import type { NotificationChannel } from './notification-channel';

/**
 * Таймаут запроса к Telegram (docs/CHAT.md §6).
 *
 * Пять секунд: уведомление отправляется внутри HTTP-запроса посетителя,
 * и дольше держать его ответ из-за мессенджера нельзя. Лид к этому моменту
 * уже сохранён, поэтому обрыв по таймауту теряет сообщение, а не лид.
 */
export const TELEGRAM_TIMEOUT_MS = 5000;

/** Какие события умеет доставлять канал. Только чат — остальное почтой. */
const SUPPORTED = new Set(['CHAT_LEAD', 'CHAT_HANDOFF']);

/**
 * Канал доставки в Telegram.
 *
 * Без новых зависимостей: глобальный `fetch` и `AbortController` есть в Node
 * с версии 18. SDK Telegram ради одного POST-запроса не нужен.
 *
 * Сообщение короткое и со ссылкой: переписка целиком в мессенджер не уходит.
 * Во-первых, она там нечитаема, во-вторых — это персональные данные
 * посетителя в чужом сервисе, и выкладывать туда весь разговор незачем,
 * когда менеджеру нужен один клик до админки.
 */
@Injectable()
export class TelegramChannel implements NotificationChannel {
  readonly name = 'telegram';
  private readonly logger = new Logger(TelegramChannel.name);

  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
  ) {}

  supports(event: NotificationEvent): boolean {
    return SUPPORTED.has(event.type);
  }

  async send(event: NotificationEvent): Promise<void> {
    if (event.type !== 'CHAT_LEAD' && event.type !== 'CHAT_HANDOFF') {
      // Недостижимо при честном вызове через supports(), но лучше явный
      // отказ, чем отправка пустого сообщения.
      throw new Error(`Telegram: событие "${event.type}" каналом не поддерживается`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: renderTelegramMessage(event),
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Telegram: HTTP ${response.status}`);
      }
      this.logger.log(`сообщение "${event.type}" отправлено в Telegram`);
    } catch (error) {
      // AbortError по таймауту выглядит иначе у разных рантаймов —
      // приводим к одному понятному сообщению.
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Telegram: нет ответа за ${TELEGRAM_TIMEOUT_MS} мс`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Подписи сообщения на трёх языках: язык берётся из сессии разговора (§2). */
const WORDING: Record<
  Locale,
  { lead: string; handoff: string; asked: string; noQuestion: string; noContacts: string }
> = {
  RU: {
    lead: '🔔 Новый лид из чата',
    handoff: '🙋 В чате просят человека',
    asked: 'Спрашивала',
    noQuestion: 'Вопрос не задан',
    noContacts: 'Контактов нет',
  },
  HY: {
    lead: '🔔 Նոր հայտ չատից',
    handoff: '🙋 Չատում խնդրում են մասնագետի',
    asked: 'Հարցրել է',
    noQuestion: 'Հարց չի տրվել',
    noContacts: 'Կոնտակտներ չկան',
  },
  EN: {
    lead: '🔔 New chat lead',
    handoff: '🙋 A chat visitor asks for a human',
    asked: 'Asked',
    noQuestion: 'No question was asked',
    noContacts: 'No contacts',
  },
};

/**
 * Текст сообщения, ровно по образцу из §6:
 *
 *     🔔 Новый лид из чата
 *     Ани · +374 99 099 457
 *     Спрашивала: сколько стоит ремонт 60 м² под ключ
 *     → https://renovateam.am/admin/chat/<id>
 *
 * Без разметки Markdown: имя посетителя и его вопрос — произвольный текст,
 * и `*`, `_` или `[` в нём сломали бы разбор на стороне Telegram. Простой
 * текст читается так же, а испортить его нечем.
 */
export function renderTelegramMessage(
  event: Extract<NotificationEvent, { type: 'CHAT_LEAD' | 'CHAT_HANDOFF' }>,
): string {
  const wording = WORDING[event.locale];
  const title = event.type === 'CHAT_LEAD' ? wording.lead : wording.handoff;

  const contact = [event.name, event.phone].filter((part) => part !== '').join(' · ');
  const question =
    event.question === '' ? wording.noQuestion : `${wording.asked}: ${collapse(event.question)}`;

  return [
    title,
    contact === '' ? wording.noContacts : contact,
    question,
    `→ ${event.adminLink}`,
  ].join('\n');
}

/**
 * Вопрос в одну строку: перевод строки внутри реплики разорвал бы формат
 * сообщения, в котором каждая строка значит своё.
 */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

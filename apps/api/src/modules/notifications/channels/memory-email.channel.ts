import { Injectable, Logger } from '@nestjs/common';
import { renderTemplate, type RenderedMessage } from '../templates';
import type { NotificationEvent } from '../public';
import type { NotificationChannel } from './notification-channel';

/** Отправленное письмо, сохранённое в памяти (разработка и тесты). */
export interface SentMessage extends RenderedMessage {
  to: string;
  type: NotificationEvent['type'];
  sentAt: Date;
}

/**
 * Канал-заглушка: письма не уходят наружу, а складываются в памяти.
 * Используется при MAIL_DRIVER=memory и в тестах, где по содержимому
 * письма достаётся ссылка верификации.
 */
@Injectable()
export class MemoryEmailChannel implements NotificationChannel {
  readonly name = 'memory-email';
  private readonly logger = new Logger(MemoryEmailChannel.name);
  private readonly messages: SentMessage[] = [];
  /**
   * Причина отказа канала. По умолчанию `null` — канал работает как раньше.
   * Включается только из тестов (`failDelivery`), чтобы проверить, что API
   * честно отвечает «письмо не ушло». Боевая конфигурация этот канал не
   * создаёт вовсе (MAIL_DRIVER=resend), так что на прод переключатель не влияет.
   */
  private failure: string | null = null;

  supports(): boolean {
    return true;
  }

  async send(event: NotificationEvent): Promise<void> {
    if (this.failure !== null) {
      // Ведёт себя как настоящий канал при отказе провайдера: бросает.
      return Promise.reject(new Error(this.failure));
    }
    const rendered = renderTemplate(event);
    this.messages.push({ ...rendered, to: event.to, type: event.type, sentAt: new Date() });
    this.logger.debug(
      `письмо "${event.type}" для ${event.to} (memory)\n${rendered.subject}\n${rendered.text}` +
        `\n[html ${rendered.html.length} байт]`,
    );
    return Promise.resolve();
  }

  /** Все отправленные письма — только для тестов и локальной отладки. */
  all(): readonly SentMessage[] {
    return this.messages;
  }

  /** Последнее письмо указанного адресата. */
  lastTo(to: string): SentMessage | undefined {
    return [...this.messages].reverse().find((message) => message.to === to);
  }

  /**
   * Заставляет канал отклонять письма — для тестов честности ответов API.
   * Сбрасывается `deliverNormally()` и `clear()`.
   */
  failDelivery(reason = 'почтовый канал недоступен (тест)'): void {
    this.failure = reason;
  }

  /** Возвращает канал в рабочее состояние. */
  deliverNormally(): void {
    this.failure = null;
  }

  clear(): void {
    this.messages.length = 0;
    this.failure = null;
  }
}

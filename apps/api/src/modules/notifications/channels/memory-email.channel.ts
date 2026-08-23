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

  supports(): boolean {
    return true;
  }

  async send(event: NotificationEvent): Promise<void> {
    const rendered = renderTemplate(event);
    this.messages.push({ ...rendered, to: event.to, type: event.type, sentAt: new Date() });
    this.logger.debug(`письмо "${event.type}" для ${event.to} (memory)`);
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

  clear(): void {
    this.messages.length = 0;
  }
}

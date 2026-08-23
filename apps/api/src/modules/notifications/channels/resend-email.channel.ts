import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { renderTemplate } from '../templates';
import type { NotificationEvent } from '../public';
import type { NotificationChannel } from './notification-channel';

/** Боевой канал доставки писем. Подключается при MAIL_DRIVER=resend. */
@Injectable()
export class ResendEmailChannel implements NotificationChannel {
  readonly name = 'resend-email';
  private readonly logger = new Logger(ResendEmailChannel.name);
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }

  supports(): boolean {
    return true;
  }

  async send(event: NotificationEvent): Promise<void> {
    const { subject, text } = renderTemplate(event);
    const result = await this.client.emails.send({
      from: this.from,
      to: event.to,
      subject,
      text,
    });
    if (result.error) {
      throw new Error(`Resend: ${result.error.message}`);
    }
    this.logger.log(`письмо "${event.type}" отправлено на ${event.to}, id=${result.data?.id}`);
  }
}

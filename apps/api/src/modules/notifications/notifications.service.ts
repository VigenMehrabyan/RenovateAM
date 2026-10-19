import { Inject, Injectable, Logger } from '@nestjs/common';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './channels/notification-channel';
import type { NotificationDelivery, NotificationEvent, NotificationsPublicService } from './public';

/**
 * Диспетчер уведомлений. Рассылает событие во все каналы, которые его
 * поддерживают. Падение канала не роняет бизнес-операцию — но и не
 * выдаётся за успех: наружу уходит `accepted: false`, и вызывающий решает,
 * что сказать пользователю.
 */
@Injectable()
export class NotificationsService implements NotificationsPublicService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@Inject(NOTIFICATION_CHANNELS) private readonly channels: NotificationChannel[]) {}

  async send(event: NotificationEvent): Promise<NotificationDelivery> {
    let accepted = false;
    for (const channel of this.channels) {
      if (!channel.supports(event)) continue;
      try {
        await channel.send(event);
        accepted = true;
      } catch (error) {
        this.logger.error(
          `канал ${channel.name} не доставил "${event.type}" на ${event.to}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    // Ни один канал не взял событие — это тоже недоставка, а не тишина.
    if (!accepted) {
      this.logger.error(`событие "${event.type}" для ${event.to} не принял ни один канал`);
    }
    return { accepted };
  }
}

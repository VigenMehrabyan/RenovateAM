import { Inject, Injectable, Logger } from '@nestjs/common';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './channels/notification-channel';
import type { NotificationEvent, NotificationsPublicService } from './public';

/**
 * Диспетчер уведомлений. Рассылает событие во все каналы, которые его
 * поддерживают. Падение канала не роняет бизнес-операцию — только лог.
 */
@Injectable()
export class NotificationsService implements NotificationsPublicService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@Inject(NOTIFICATION_CHANNELS) private readonly channels: NotificationChannel[]) {}

  async send(event: NotificationEvent): Promise<void> {
    for (const channel of this.channels) {
      if (!channel.supports(event)) continue;
      try {
        await channel.send(event);
      } catch (error) {
        this.logger.error(
          `канал ${channel.name} не доставил "${event.type}" на ${event.to}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}

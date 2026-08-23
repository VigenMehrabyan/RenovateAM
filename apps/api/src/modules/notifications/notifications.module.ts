import { Global, Module } from '@nestjs/common';
import { CONFIG, type AppConfig } from '@config';
import { MemoryEmailChannel } from './channels/memory-email.channel';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './channels/notification-channel';
import { ResendEmailChannel } from './channels/resend-email.channel';
import { NotificationsService } from './notifications.service';
import { NOTIFICATIONS_PUBLIC_SERVICE } from './public';

/**
 * Модуль уведомлений. Наружу торчит только публичный сервис под токеном
 * NOTIFICATIONS_PUBLIC_SERVICE; каналы приватны.
 *
 * MemoryEmailChannel экспортируется отдельно: тесты и локальная разработка
 * читают из него отправленные письма. В боевой конфигурации он не создаётся.
 */
@Global()
@Module({
  providers: [
    MemoryEmailChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [CONFIG, MemoryEmailChannel],
      useFactory: (config: AppConfig, memory: MemoryEmailChannel): NotificationChannel[] =>
        config.mail.driver === 'resend'
          ? [new ResendEmailChannel(config.mail.apiKey, config.mail.from)]
          : [memory],
    },
    NotificationsService,
    { provide: NOTIFICATIONS_PUBLIC_SERVICE, useExisting: NotificationsService },
  ],
  exports: [NOTIFICATIONS_PUBLIC_SERVICE, MemoryEmailChannel],
})
export class NotificationsModule {}

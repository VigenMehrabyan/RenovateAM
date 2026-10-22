import { Global, Logger, Module } from '@nestjs/common';
import { CONFIG, type AppConfig } from '@config';
import { MemoryEmailChannel } from './channels/memory-email.channel';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './channels/notification-channel';
import { ResendEmailChannel } from './channels/resend-email.channel';
import { TelegramChannel } from './channels/telegram.channel';
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
      useFactory: (config: AppConfig, memory: MemoryEmailChannel): NotificationChannel[] => [
        ...(config.mail.driver === 'resend'
          ? [new ResendEmailChannel(config.mail.apiKey, config.mail.from)]
          : [memory]),
        ...buildTelegramChannel(config),
      ],
    },
    NotificationsService,
    { provide: NOTIFICATIONS_PUBLIC_SERVICE, useExisting: NotificationsService },
  ],
  exports: [NOTIFICATIONS_PUBLIC_SERVICE, MemoryEmailChannel],
})
export class NotificationsModule {}

/**
 * Канал Telegram, если он настроен (docs/CHAT.md §6).
 *
 * Пустые `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` — нормальный режим: канала
 * просто нет, и локальная разработка работает без бота. В production это
 * один раз при старте пишется в лог — молча терять уведомления о лидах
 * нельзя, а ронять процесс из-за мессенджера нельзя тем более: письмо
 * менеджеру уходит всё равно, и приложение должно подняться.
 */
function buildTelegramChannel(config: AppConfig): NotificationChannel[] {
  const { botToken, chatId } = config.telegram;
  if (botToken !== '' && chatId !== '') {
    return [new TelegramChannel(botToken, chatId)];
  }

  if (config.nodeEnv === 'production') {
    const missing = [
      botToken === '' ? 'TELEGRAM_BOT_TOKEN' : null,
      chatId === '' ? 'TELEGRAM_CHAT_ID' : null,
    ].filter((name): name is string => name !== null);
    new Logger('NotificationsModule').warn(
      `${missing.join(' и ')} не задан${missing.length > 1 ? 'ы' : ''}: ` +
        'уведомления о лидах из чата в Telegram не уйдут, останется только письмо на MANAGER_EMAIL',
    );
  }
  return [];
}

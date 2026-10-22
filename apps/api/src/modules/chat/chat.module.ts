import { Module } from '@nestjs/common';
import { ChatAdminController } from './chat-admin.controller';
import { ChatController } from './chat.controller';
import { ChatRepository } from './chat.repository';
import { ChatService } from './chat.service';
import { CHAT_PUBLIC_SERVICE } from './public';

/**
 * Чат-бот на сайте (docs/CHAT.md).
 *
 * Владеет таблицами chat_sessions и chat_messages. Наружу торчит только
 * публичный сервис под токеном CHAT_PUBLIC_SERVICE; репозиторий, движок
 * поиска и база знаний приватны.
 *
 * NotificationsModule не импортируется: он объявлен @Global, и токен
 * NOTIFICATIONS_PUBLIC_SERVICE доступен без явного импорта — так же, как
 * в остальных модулях.
 */
@Module({
  controllers: [ChatController, ChatAdminController],
  providers: [
    ChatService,
    ChatRepository,
    { provide: CHAT_PUBLIC_SERVICE, useExisting: ChatService },
  ],
  exports: [CHAT_PUBLIC_SERVICE],
})
export class ChatModule {}

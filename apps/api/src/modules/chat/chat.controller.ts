import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { OptionalUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import type { AuthUser } from '@common/types/auth-user';
import { ChatService } from './chat.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SaveContactsDto } from './dto/save-contacts.dto';
import { SendMessageDto } from './dto/send-message.dto';
import type { ChatReply, ChatSessionStarted } from './public';

/**
 * Диалог с ботом (docs/CHAT.md §5.1). Все эндпоинты публичные: посетитель
 * спрашивает без регистрации, это и есть смысл виджета.
 *
 * Троттлинг — отдельная группа `chat` (20 сообщений в минуту на IP),
 * объявлена в AppModule и включается только на этих маршрутах.
 */
@Public()
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post('sessions')
  @HttpCode(201)
  async createSession(
    @Body() dto: CreateSessionDto,
    @OptionalUser() user: AuthUser | undefined,
  ): Promise<ChatSessionStarted> {
    // Токен не обязателен, но если он есть — разговор привязывается
    // к пользователю: менеджер видит, что это уже клиент, а не новый лид.
    return this.chat.startSession({
      locale: dto.locale,
      ...(dto.pageUrl !== undefined ? { pageUrl: dto.pageUrl } : {}),
      ...(user ? { userId: user.id } : {}),
    });
  }

  @Post('sessions/:id/messages')
  @HttpCode(200)
  async sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ): Promise<{ reply: ChatReply }> {
    return { reply: await this.chat.handleMessage(id, dto.text) };
  }

  @Post('sessions/:id/contacts')
  @HttpCode(200)
  async saveContacts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveContactsDto,
  ): Promise<{ reply: ChatReply }> {
    const reply = await this.chat.saveContacts(id, {
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
    });
    return { reply };
  }

  @Post('sessions/:id/handoff')
  @HttpCode(200)
  async handoff(@Param('id', ParseUUIDPipe) id: string): Promise<{ reply: ChatReply }> {
    return { reply: await this.chat.requestHandoff(id) };
  }
}

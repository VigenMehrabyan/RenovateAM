import { Injectable } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import type { ChatRole, Locale } from '@db/enums';
import type { ChatMessage, ChatSession, Prisma } from '@db';

/** Новое сообщение разговора в том виде, в котором его пишет сервис. */
export interface NewMessage {
  role: ChatRole;
  text: string;
  entryId: string | null;
}

/** Приватный репозиторий модуля chat. Владеет chat_sessions и chat_messages. */
@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(data: {
    locale: Locale;
    userId: string | null;
    pageUrl: string | null;
  }): Promise<ChatSession> {
    return this.prisma.chatSession.create({ data });
  }

  async findSession(id: string): Promise<ChatSession | null> {
    return this.prisma.chatSession.findUnique({ where: { id } });
  }

  async updateSession(id: string, data: Prisma.ChatSessionUpdateInput): Promise<ChatSession> {
    return this.prisma.chatSession.update({ where: { id }, data });
  }

  /**
   * Пишет сообщения разговора и сдвигает `last_message_at` одной транзакцией.
   *
   * Иначе разговор может оказаться без ответа бота (упали между вставками)
   * или свежим без новых сообщений — а по `last_message_at` строится очередь
   * менеджера.
   */
  async appendMessages(
    sessionId: string,
    messages: NewMessage[],
    at: Date,
  ): Promise<ChatMessage[]> {
    return this.prisma.$transaction(async (tx) => {
      const created: ChatMessage[] = [];
      for (const message of messages) {
        created.push(
          await tx.chatMessage.create({
            data: {
              sessionId,
              role: message.role,
              text: message.text,
              entryId: message.entryId,
            },
          }),
        );
      }
      await tx.chatSession.update({ where: { id: sessionId }, data: { lastMessageAt: at } });
      return created;
    });
  }

  async countVisitorMessages(sessionId: string): Promise<number> {
    return this.prisma.chatMessage.count({ where: { sessionId, role: 'VISITOR' } });
  }

  /** Первый вопрос посетителя — он уходит менеджеру и в строку списка лидов. */
  async findFirstVisitorMessage(sessionId: string): Promise<ChatMessage | null> {
    return this.prisma.chatMessage.findFirst({
      where: { sessionId, role: 'VISITOR' },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Последнее сообщение разговора — чем бы оно ни было. */
  async findLastMessage(sessionId: string): Promise<ChatMessage | null> {
    return this.prisma.chatMessage.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listMessages(sessionId: string): Promise<ChatMessage[]> {
    return this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Страница списка лидов, новые сверху.
   *
   * В список попадают только сессии с контактами ИЛИ с запросом человека:
   * разговоры анонимов, ушедших после первого вопроса, менеджеру не нужны
   * (docs/CHAT.md §5.2).
   */
  async listLeads(params: {
    handled?: boolean;
    skip: number;
    take: number;
  }): Promise<{ rows: ChatSession[]; total: number }> {
    const where: Prisma.ChatSessionWhereInput = {
      OR: [{ leadCapturedAt: { not: null } }, { handoffRequestedAt: { not: null } }],
      ...(params.handled === undefined
        ? {}
        : params.handled
          ? { handledAt: { not: null } }
          : { handledAt: null }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.chatSession.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.chatSession.count({ where }),
    ]);
    return { rows, total };
  }

  /**
   * Первые вопросы сразу для нескольких разговоров: список лидов иначе
   * сделал бы по запросу на строку.
   */
  async firstVisitorMessages(sessionIds: string[]): Promise<Map<string, string>> {
    if (sessionIds.length === 0) return new Map();
    const messages = await this.prisma.chatMessage.findMany({
      where: { sessionId: { in: sessionIds }, role: 'VISITOR' },
      orderBy: { createdAt: 'asc' },
      select: { sessionId: true, text: true },
    });
    const first = new Map<string, string>();
    for (const message of messages) {
      if (!first.has(message.sessionId)) first.set(message.sessionId, message.text);
    }
    return first;
  }
}

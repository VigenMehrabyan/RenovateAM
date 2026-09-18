import { Injectable } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import { RequestStatus, UserRole } from '@db/enums';
import type { Comment, Decision, Prisma, Quote, Request, StatusLogEntry } from '@db';

export type RequestWithDecision = Request & { decision: Decision | null };

/** Связь «сообщение — вложение» вместе с заявкой, которой оно принадлежит. */
export interface CommentFileLink {
  commentId: string;
  fileId: string;
  requestId: string;
}

/**
 * Приватный репозиторий модуля requests. Владеет таблицами
 * requests, status_log, decisions, quotes, comments, comment_files.
 */
@Injectable()
export class RequestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Создание заявки вместе с первой записью журнала — одной транзакцией,
   * но только если пользователь не исчерпал окно антидубля.
   *
   * Инварианта «одна активная заявка» больше нет: заявок может быть несколько.
   * Защиту от двойного нажатия, которую раньше давал частичный уникальный
   * индекс, держит окно `maxPerWindow` за `windowStart`. Счётчик и вставка
   * идут в одной транзакции под advisory-блокировкой по пользователю —
   * иначе параллельные отправки посчитали бы одно и то же значение и
   * проскочили лимит все разом.
   *
   * @returns созданную заявку либо `null`, если лимит исчерпан.
   */
  async createWithLogWithinLimit(
    data: Prisma.RequestUncheckedCreateInput,
    limit: { maxPerWindow: number; windowStart: Date },
  ): Promise<RequestWithDecision | null> {
    return this.prisma.$transaction(async (tx) => {
      // $executeRaw, а не $queryRaw: pg_advisory_xact_lock возвращает void,
      // и десериализовать такую колонку Prisma не умеет.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.userId}::text, 0))`;

      const recent = await tx.request.count({
        where: { userId: data.userId, createdAt: { gte: limit.windowStart } },
      });
      if (recent >= limit.maxPerWindow) return null;

      const created = await tx.request.create({ data });
      await tx.statusLogEntry.create({
        data: {
          requestId: created.id,
          fromStatus: null,
          toStatus: created.status,
          actorId: created.userId,
        },
      });
      return { ...created, decision: null };
    });
  }

  async findById(id: string): Promise<RequestWithDecision | null> {
    return this.prisma.request.findUnique({ where: { id }, include: { decision: true } });
  }

  /** Заявки клиента, свежие изменения первыми; порядок «важное вперёд» — в сервисе. */
  async listByUser(userId: string): Promise<RequestWithDecision[]> {
    return this.prisma.request.findMany({
      where: { userId },
      include: { decision: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async countActiveByUser(
    userId: string,
    activeStatuses: readonly RequestStatus[],
  ): Promise<number> {
    return this.prisma.request.count({
      where: { userId, status: { in: [...activeStatuses] } },
    });
  }

  async list(params: {
    status?: RequestStatus;
    userIds?: string[];
    skip: number;
    take: number;
    sortDirection: 'asc' | 'desc';
  }): Promise<{ items: RequestWithDecision[]; total: number }> {
    const where: Prisma.RequestWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.userIds ? { userId: { in: params.userIds } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.request.findMany({
        where,
        include: { decision: true },
        orderBy: { createdAt: params.sortDirection },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.request.count({ where }),
    ]);
    return { items, total };
  }

  /** Смена статуса и запись журнала — атомарно. */
  async transition(params: {
    requestId: string;
    from: RequestStatus;
    to: RequestStatus;
    actorId: string;
    comment: string | null;
  }): Promise<RequestWithDecision> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.request.update({
        where: { id: params.requestId },
        data: {
          status: params.to,
          ...(params.comment !== null ? { comment: params.comment } : {}),
        },
        include: { decision: true },
      });
      await tx.statusLogEntry.create({
        data: {
          requestId: params.requestId,
          fromStatus: params.from,
          toStatus: params.to,
          actorId: params.actorId,
          comment: params.comment,
        },
      });
      return updated;
    });
  }

  /** Решение клиента и перевод заявки в терминальный статус — атомарно. */
  async createDecision(params: {
    requestId: string;
    from: RequestStatus;
    to: RequestStatus;
    actorId: string;
    data: Prisma.DecisionUncheckedCreateInput;
  }): Promise<RequestWithDecision> {
    return this.prisma.$transaction(async (tx) => {
      await tx.decision.create({ data: params.data });
      const updated = await tx.request.update({
        where: { id: params.requestId },
        data: { status: params.to },
        include: { decision: true },
      });
      await tx.statusLogEntry.create({
        data: {
          requestId: params.requestId,
          fromStatus: params.from,
          toStatus: params.to,
          actorId: params.actorId,
        },
      });
      return updated;
    });
  }

  async findDecision(requestId: string): Promise<Decision | null> {
    return this.prisma.decision.findUnique({ where: { requestId } });
  }

  async listStatusLog(requestId: string): Promise<StatusLogEntry[]> {
    return this.prisma.statusLogEntry.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Новая смета становится актуальной, предыдущая сохраняется с
   * is_current = false: «сметчик загрузил смету не в ту заявку» решается
   * заменой файла, а не удалением истории (MVP §7).
   */
  async createQuote(data: Prisma.QuoteUncheckedCreateInput): Promise<Quote> {
    return this.prisma.$transaction(async (tx) => {
      await tx.quote.updateMany({
        where: { requestId: data.requestId, isCurrent: true },
        data: { isCurrent: false },
      });
      return tx.quote.create({ data: { ...data, isCurrent: true } });
    });
  }

  async findCurrentQuote(requestId: string): Promise<Quote | null> {
    return this.prisma.quote.findFirst({ where: { requestId, isCurrent: true } });
  }

  /** Актуальные сметы пачкой — чтобы список кабинета не делал запрос на строку. */
  async findCurrentQuotes(requestIds: string[]): Promise<Quote[]> {
    if (requestIds.length === 0) return [];
    return this.prisma.quote.findMany({
      where: { requestId: { in: requestIds }, isCurrent: true },
    });
  }

  // --- обсуждение ----------------------------------------------------------

  /**
   * Сообщение вместе со ссылками на вложения — одной транзакцией: сообщение
   * без своих файлов в ленте выглядит как потерянный чертёж.
   *
   * Метода изменения и удаления здесь нет намеренно: лента append-only.
   */
  async createComment(params: {
    requestId: string;
    authorId: string;
    authorRole: UserRole;
    text: string;
    fileIds: string[];
  }): Promise<Comment> {
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          requestId: params.requestId,
          authorId: params.authorId,
          authorRole: params.authorRole,
          text: params.text,
        },
      });
      if (params.fileIds.length > 0) {
        await tx.commentFile.createMany({
          data: params.fileIds.map((fileId) => ({ commentId: comment.id, fileId })),
          skipDuplicates: true,
        });
      }
      return comment;
    });
  }

  /** Лента заявки: от старых сообщений к новым. */
  async listComments(requestId: string): Promise<Comment[]> {
    return this.prisma.comment.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Связи «сообщение — вложение» для набора заявок. Одним запросом: нужен
   * и списку кабинета (пометка «из переписки» у файлов), и карточке.
   */
  async listCommentFileLinks(requestIds: string[]): Promise<CommentFileLink[]> {
    if (requestIds.length === 0) return [];
    const rows = await this.prisma.commentFile.findMany({
      where: { comment: { requestId: { in: requestIds } } },
      select: { commentId: true, fileId: true, comment: { select: { requestId: true } } },
    });
    return rows.map((row) => ({
      commentId: row.commentId,
      fileId: row.fileId,
      requestId: row.comment.requestId,
    }));
  }
}

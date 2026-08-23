import { Injectable } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import { RequestStatus } from '@db/enums';
import type { Decision, Prisma, Request, StatusLogEntry } from '@db';

export type RequestWithDecision = Request & { decision: Decision | null };

/**
 * Приватный репозиторий модуля requests. Владеет таблицами
 * requests, status_log, decisions.
 */
@Injectable()
export class RequestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Создание заявки вместе с первой записью журнала — одной транзакцией.
   * Инвариант «одна активная заявка» держит частичный уникальный индекс
   * requests_one_active_per_user, поэтому гонка двух параллельных запросов
   * заканчивается ошибкой уникальности, а не второй заявкой.
   */
  async createWithLog(data: Prisma.RequestUncheckedCreateInput): Promise<RequestWithDecision> {
    return this.prisma.$transaction(async (tx) => {
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

  async listByUser(userId: string): Promise<RequestWithDecision[]> {
    return this.prisma.request.findMany({
      where: { userId },
      include: { decision: true },
      orderBy: { createdAt: 'desc' },
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
}

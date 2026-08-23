import { Injectable } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import type { Prisma, Quote } from '@db';

/** Приватный репозиторий модуля admin. Владеет таблицей quotes. */
@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  async findCurrentQuotes(requestIds: string[]): Promise<Quote[]> {
    if (requestIds.length === 0) return [];
    return this.prisma.quote.findMany({
      where: { requestId: { in: requestIds }, isCurrent: true },
    });
  }

  async listQuotes(requestId: string): Promise<Quote[]> {
    return this.prisma.quote.findMany({
      where: { requestId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

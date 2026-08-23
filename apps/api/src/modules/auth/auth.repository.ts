import { Injectable } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import type { Prisma, RefreshToken, User, VerificationToken } from '@db';

/**
 * Приватный репозиторий модуля auth. Владеет таблицами
 * users, verification_tokens, refresh_tokens.
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  // --- users ---------------------------------------------------------------

  async createUser(data: Prisma.UserUncheckedCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  async findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findUsersByIds(ids: string[]): Promise<User[]> {
    return this.prisma.user.findMany({ where: { id: { in: ids } } });
  }

  async findUsersByPhone(phone: string): Promise<User[]> {
    return this.prisma.user.findMany({ where: { phone }, orderBy: { createdAt: 'asc' } });
  }

  async listUsers(skip: number, take: number): Promise<{ items: User[]; total: number }> {
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.count(),
    ]);
    return { items, total };
  }

  // --- verification --------------------------------------------------------

  async createVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<VerificationToken> {
    return this.prisma.verificationToken.create({ data: { userId, tokenHash, expiresAt } });
  }

  async findVerificationToken(tokenHash: string): Promise<VerificationToken | null> {
    return this.prisma.verificationToken.findUnique({ where: { tokenHash } });
  }

  async findLatestVerificationToken(userId: string): Promise<VerificationToken | null> {
    return this.prisma.verificationToken.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async countVerificationTokensSince(userId: string, since: Date): Promise<number> {
    return this.prisma.verificationToken.count({
      where: { userId, createdAt: { gte: since } },
    });
  }

  /**
   * Подтверждение e-mail: токен гасится, пользователь помечается
   * верифицированным, все прочие активные токены пользователя аннулируются.
   * Всё в одной транзакции.
   */
  async consumeVerificationToken(tokenId: string, userId: string, now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.verificationToken.update({ where: { id: tokenId }, data: { usedAt: now } });
      await tx.verificationToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } });
    });
  }

  // --- refresh -------------------------------------------------------------

  async createRefreshToken(data: Prisma.RefreshTokenUncheckedCreateInput): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({ data });
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  async revokeRefreshToken(id: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.update({ where: { id }, data: { revokedAt: now } });
  }

  /** Отзыв всей цепочки ротации — реакция на повторное использование токена. */
  async revokeRefreshFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async revokeAllUserRefreshTokens(userId: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}

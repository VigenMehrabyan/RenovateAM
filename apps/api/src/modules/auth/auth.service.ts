import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { AppException } from '@common/errors/app.exception';
import { ErrorCode } from '@common/errors/error-codes';
import { generateToken, sha256 } from '@common/utils/hash';
import { CONFIG, type AppConfig } from '@config';
import { Locale, UserRole } from '@db/enums';
import type { User } from '@db';
import {
  NOTIFICATIONS_PUBLIC_SERVICE,
  type NotificationsPublicService,
} from '@modules/notifications/public';
import { PRICING_PUBLIC_SERVICE, type PricingPublicService } from '@modules/pricing/public';
import { AuthRepository } from './auth.repository';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { AuthPublicService, PublicUser } from './public';

/** Стоимость bcrypt. MVP требует ≥10. */
const BCRYPT_COST = 12;
/** Срок жизни ссылки верификации — 24 часа (US-2). */
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * Срок жизни ссылки восстановления пароля — 60 минут (US-10).
 *
 * Ссылка сильнее ссылки верификации: кто её открыл, тот владеет аккаунтом,
 * поэтому 24 часа верификации здесь были бы слишком широким окном — письмо
 * живёт в ящике, пересылается, попадает в общие ящики. 15 минут, наоборот,
 * не хватает живому человеку: письмо читают на другом устройстве, провайдер
 * задерживает доставку. 60 минут закрывают обычную задержку и оставляют окно
 * в пределах одного сеанса работы с почтой.
 */
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
/** Повторная отправка письма — не чаще раза в 60 секунд (US-2). */
export const RESEND_COOLDOWN_MS = 60 * 1000;
/** Суточный потолок писем на пользователя: защита от использования как ретранслятора. */
const RESEND_DAILY_LIMIT = 10;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService implements AuthPublicService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repository: AuthRepository,
    private readonly jwt: JwtService,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(NOTIFICATIONS_PUBLIC_SERVICE)
    private readonly notifications: NotificationsPublicService,
    @Inject(PRICING_PUBLIC_SERVICE) private readonly pricing: PricingPublicService,
  ) {}

  // --- регистрация и верификация ------------------------------------------

  async register(dto: RegisterDto): Promise<{ userId: string; emailVerificationSent: boolean }> {
    const email = dto.email.toLowerCase();
    const existing = await this.repository.findUserByEmail(email);
    if (existing) {
      throw new AppException(
        409,
        ErrorCode.EMAIL_ALREADY_REGISTERED,
        'Email is already registered',
      );
    }

    const user = await this.repository.createUser({
      fullName: dto.fullName,
      email,
      phone: dto.phone,
      address: dto.address,
      passwordHash: await bcrypt.hash(dto.password, BCRYPT_COST),
      role: UserRole.CLIENT,
      locale: dto.locale ?? Locale.RU,
    });

    // Анонимные расчёты привязываются к аккаунту (US-1).
    if (dto.quickEstimateIds && dto.quickEstimateIds.length > 0) {
      await this.pricing.attachEstimatesToUser(dto.quickEstimateIds, user.id);
    }

    // Аккаунт уже создан: письмо не ушло — регистрация всё равно состоялась,
    // но ответ об этом не врёт (`emailVerificationSent: false`).
    const sent = await this.issueVerificationEmail(user);
    this.logger.log(`event=user_registered user=${user.id} locale=${user.locale}`);
    return { userId: user.id, emailVerificationSent: sent };
  }

  /**
   * Выпускает токен верификации и отправляет письмо.
   * @returns принял ли канал письмо к доставке.
   */
  private async issueVerificationEmail(user: User): Promise<boolean> {
    const token = generateToken();
    await this.repository.createVerificationToken(
      user.id,
      sha256(token),
      new Date(Date.now() + VERIFICATION_TTL_MS),
    );
    const { accepted } = await this.notifications.send({
      type: 'EMAIL_VERIFICATION',
      to: user.email,
      locale: user.locale,
      link: `${this.config.appUrl}/verify?token=${token}`,
    });
    if (!accepted) {
      // Отдельное событие вместо email_verification_sent: в логах должно быть
      // видно, что письма не было, иначе воронка верификации врёт.
      this.logger.error(`event=email_verification_failed user=${user.id}`);
      return false;
    }
    this.logger.log(`event=email_verification_sent user=${user.id}`);
    return true;
  }

  async verifyEmail(rawToken: string): Promise<{ verified: true }> {
    const record = await this.repository.findVerificationToken(sha256(rawToken));
    if (!record) {
      throw new AppException(400, ErrorCode.TOKEN_INVALID, 'Verification token is invalid');
    }
    if (record.usedAt) {
      throw new AppException(409, ErrorCode.TOKEN_ALREADY_USED, 'Verification link already used');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new AppException(410, ErrorCode.TOKEN_EXPIRED, 'Verification link expired');
    }

    await this.repository.consumeVerificationToken(record.id, record.userId, new Date());
    this.logger.log(`event=email_verified user=${record.userId}`);
    return { verified: true };
  }

  async resendVerification(userId: string): Promise<{ sent: true; nextAllowedAt: string }> {
    const user = await this.repository.findUserById(userId);
    if (!user) throw new AppException(404, ErrorCode.NOT_FOUND, 'User not found');
    if (user.emailVerifiedAt) {
      throw new AppException(409, ErrorCode.ALREADY_VERIFIED, 'Email is already verified');
    }

    // Троттлинг считается по БД, а не по памяти процесса: инстансов может быть несколько.
    const latest = await this.repository.findLatestVerificationToken(userId);
    if (latest) {
      const elapsed = Date.now() - latest.createdAt.getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        throw new AppException(
          429,
          ErrorCode.RESEND_TOO_SOON,
          'Verification email was sent recently',
          { headers: { 'Retry-After': String(retryAfter) } },
        );
      }
    }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (
      (await this.repository.countVerificationTokensSince(userId, dayAgo)) >= RESEND_DAILY_LIMIT
    ) {
      throw new AppException(429, ErrorCode.RESEND_TOO_SOON, 'Daily verification email limit', {
        headers: { 'Retry-After': '3600' },
      });
    }

    // Токен уже выпущен, поэтому следующая попытка упрётся в окно 60 секунд —
    // так и надо: ломящийся почтовый провайдер не должен получать шквал запросов.
    if (!(await this.issueVerificationEmail(user))) {
      throw new AppException(
        502,
        ErrorCode.EMAIL_DELIVERY_FAILED,
        'Verification email was not accepted by the mail channel',
      );
    }
    return {
      sent: true,
      nextAllowedAt: new Date(Date.now() + RESEND_COOLDOWN_MS).toISOString(),
    };
  }

  // --- восстановление пароля ----------------------------------------------

  /**
   * Запрос письма со ссылкой восстановления.
   *
   * Ответ ОДИНАКОВ для существующего и несуществующего адреса — и по статусу,
   * и по телу, и по времени. Статус с телом задаёт контроллер (202
   * `{ accepted: true }`), а время закрыто здесь: дорогая асимметричная часть,
   * обращение к почтовому провайдеру, вынесена за пределы ответа. Токен
   * выпускается, отправка запускается без `await`, метод возвращается сразу.
   * Поэтому ветки отличаются одной вставкой в БД (единицы миллисекунд, ниже
   * сетевого шума), а не секундами ожидания SMTP.
   *
   * Сказать «письмо не ушло», как это делает resendVerification, здесь нельзя:
   * такой ответ сам был бы признаком существования аккаунта.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.repository.findUserByEmail(email.toLowerCase());
    if (!user) {
      // В лог — да, в ответ — нет: логи внутренние, ответ виден снаружи.
      this.logger.log('event=password_reset_requested user=unknown');
      return;
    }

    const token = generateToken();
    await this.repository.createPasswordResetToken(
      user.id,
      sha256(token),
      new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    );
    this.logger.log(`event=password_reset_requested user=${user.id}`);

    // Намеренно без await: см. комментарий выше. Исключение внутрь
    // notifications не выходит, но страховка от «unhandled rejection» нужна.
    void this.deliverPasswordResetEmail(user, token);
  }

  /** Отправка письма со ссылкой. Сам токен в лог не попадает — только исход. */
  private async deliverPasswordResetEmail(user: User, token: string): Promise<void> {
    try {
      const { accepted } = await this.notifications.send({
        type: 'PASSWORD_RESET',
        to: user.email,
        locale: user.locale,
        link: `${this.config.appUrl}/reset?token=${token}`,
      });
      this.logger[accepted ? 'log' : 'error'](
        `event=password_reset_email_${accepted ? 'sent' : 'failed'} user=${user.id}`,
      );
    } catch {
      this.logger.error(`event=password_reset_email_failed user=${user.id}`);
    }
  }

  /**
   * Установка нового пароля по ссылке из письма.
   *
   * Порядок проверок и коды — те же, что у верификации e-mail: страница знает,
   * какую ссылку она проверяла, и подбирает текст сама. Сам токен ни в одно
   * сообщение об ошибке не попадает.
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<{ reset: true }> {
    const record = await this.repository.findPasswordResetToken(sha256(rawToken));
    if (!record) {
      throw new AppException(400, ErrorCode.TOKEN_INVALID, 'Password reset token is invalid');
    }
    if (record.usedAt) {
      throw new AppException(409, ErrorCode.TOKEN_ALREADY_USED, 'Password reset link already used');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new AppException(410, ErrorCode.TOKEN_EXPIRED, 'Password reset link expired');
    }

    await this.repository.consumePasswordResetToken(
      record.id,
      record.userId,
      await bcrypt.hash(newPassword, BCRYPT_COST),
      new Date(),
    );
    // Сессии, открытые старым паролем, погашены вместе со сменой хеша.
    this.logger.log(`event=password_reset_completed user=${record.userId}`);
    return { reset: true };
  }

  // --- вход и токены -------------------------------------------------------

  async login(dto: LoginDto, meta: { userAgent?: string; ip?: string }) {
    const user = await this.repository.findUserByEmail(dto.email.toLowerCase());
    // Ответ одинаков для «нет пользователя» и «неверный пароль».
    const valid = user ? await bcrypt.compare(dto.password, user.passwordHash) : false;
    if (!user || !valid) {
      throw new AppException(401, ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    const tokens = await this.issueTokenPair(user, randomUUID(), meta);
    return { tokens, user: toPublicUser(user) };
  }

  /** Ротация: старый токен гасится, новый выдаётся в той же цепочке. */
  async refresh(rawToken: string | undefined, meta: { userAgent?: string; ip?: string }) {
    if (!rawToken) {
      throw new AppException(401, ErrorCode.REFRESH_INVALID, 'Refresh token is missing');
    }
    const record = await this.repository.findRefreshToken(sha256(rawToken));
    if (!record) {
      throw new AppException(401, ErrorCode.REFRESH_INVALID, 'Refresh token is invalid');
    }

    const now = new Date();
    if (record.revokedAt) {
      // Повторное использование = признак кражи: гасим всю цепочку.
      await this.repository.revokeRefreshFamily(record.familyId, now);
      this.logger.warn(`refresh token reuse detected, family=${record.familyId} revoked`);
      throw new AppException(401, ErrorCode.REFRESH_INVALID, 'Refresh token already used');
    }
    if (record.expiresAt.getTime() < now.getTime()) {
      throw new AppException(401, ErrorCode.REFRESH_INVALID, 'Refresh token expired');
    }

    const user = await this.repository.findUserById(record.userId);
    if (!user) throw new AppException(401, ErrorCode.REFRESH_INVALID, 'Refresh token is invalid');

    await this.repository.revokeRefreshToken(record.id, now);
    return this.issueTokenPair(user, record.familyId, meta);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const record = await this.repository.findRefreshToken(sha256(rawToken));
    if (record && !record.revokedAt) {
      await this.repository.revokeRefreshFamily(record.familyId, new Date());
    }
  }

  private async issueTokenPair(
    user: User,
    familyId: string,
    meta: { userAgent?: string; ip?: string },
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        role: user.role,
        emailVerified: user.emailVerifiedAt !== null,
        jti: randomUUID(),
      },
      { secret: this.config.jwt.accessSecret, expiresIn: this.config.jwt.accessTtl },
    );

    const refreshToken = generateToken();
    const refreshExpiresAt = new Date(
      Date.now() + this.config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000,
    );
    await this.repository.createRefreshToken({
      userId: user.id,
      tokenHash: sha256(refreshToken),
      familyId,
      expiresAt: refreshExpiresAt,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    });

    return { accessToken, refreshToken, refreshExpiresAt };
  }

  // --- публичный интерфейс модуля -----------------------------------------

  async getUserById(userId: string): Promise<PublicUser | null> {
    const user = await this.repository.findUserById(userId);
    return user ? toPublicUser(user) : null;
  }

  async isEmailVerified(userId: string): Promise<boolean> {
    const user = await this.repository.findUserById(userId);
    return user?.emailVerifiedAt !== null && user !== null;
  }

  async findUserIdsByPhone(phone: string): Promise<string[]> {
    const users = await this.repository.findUsersByPhone(phone);
    return users.map((user) => user.id);
  }

  async getUsersByIds(userIds: string[]): Promise<PublicUser[]> {
    if (userIds.length === 0) return [];
    const users = await this.repository.findUsersByIds(userIds);
    return users.map(toPublicUser);
  }

  async listUsers(page: number, pageSize: number) {
    const { items, total } = await this.repository.listUsers((page - 1) * pageSize, pageSize);
    return { items: items.map(toPublicUser), total, page, pageSize };
  }
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    address: user.address,
    role: user.role,
    locale: user.locale,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

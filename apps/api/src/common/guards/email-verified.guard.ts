import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthPublicService, AUTH_PUBLIC_SERVICE } from '@modules/auth/public';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import type { AuthUser } from '../types/auth-user';

/**
 * Гейт «подтвердите e-mail» (US-2): до верификации пользователь входит
 * в кабинет, но не может отправить заявку и загрузить файлы.
 *
 * Статус читается из БД, а не из payload токена: иначе после верификации
 * пришлось бы ждать до 15 минут, пока протухнет старый access-токен.
 */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(@Inject(AUTH_PUBLIC_SERVICE) private readonly auth: AuthPublicService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    if (!user)
      throw new AppException(401, ErrorCode.INVALID_CREDENTIALS, 'Authentication required');

    const verified = await this.auth.isEmailVerified(user.id);
    if (!verified) {
      throw new AppException(403, ErrorCode.EMAIL_NOT_VERIFIED, 'Email is not verified');
    }
    request.user = { ...user, emailVerified: true };
    return true;
  }
}

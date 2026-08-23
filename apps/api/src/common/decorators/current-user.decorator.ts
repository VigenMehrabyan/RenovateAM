import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../types/auth-user';

/** Пользователь из access-токена. Только для эндпоинтов под JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!request.user) throw new Error('CurrentUser использован на эндпоинте без аутентификации');
    return request.user;
  },
);

/**
 * Пользователь, если токен был передан. Для @Public()-эндпоинтов, которые
 * работают и для гостя, и для авторизованного клиента (быстрый расчёт).
 */
export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    return request.user;
  },
);

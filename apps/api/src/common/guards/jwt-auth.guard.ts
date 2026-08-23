import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import type { AccessTokenPayload, AuthUser } from '../types/auth-user';

/**
 * Глобальный guard: без валидного access-токена закрыто всё,
 * кроме эндпоинтов, помеченных @Public().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = extractBearer(request);

    if (token) {
      try {
        const payload = this.jwt.verify<AccessTokenPayload>(token, {
          secret: this.config.jwt.accessSecret,
        });
        request.user = {
          id: payload.sub,
          role: payload.role,
          emailVerified: payload.emailVerified,
        };
        return true;
      } catch (error) {
        if (isPublic) return true;
        const expired = error instanceof Error && error.name === 'TokenExpiredError';
        throw new AppException(
          401,
          expired ? ErrorCode.ACCESS_TOKEN_EXPIRED : ErrorCode.INVALID_CREDENTIALS,
          expired ? 'Access token expired' : 'Invalid access token',
        );
      }
    }

    if (isPublic) return true;
    throw new AppException(401, ErrorCode.INVALID_CREDENTIALS, 'Authentication required');
  }
}

function extractBearer(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
  return value;
}

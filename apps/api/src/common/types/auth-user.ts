import type { UserRole } from '@db/enums';

/** Пользователь, извлечённый из access-токена и положенный в request. */
export interface AuthUser {
  id: string;
  role: UserRole;
  emailVerified: boolean;
}

/** Payload access-токена. */
export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  emailVerified: boolean;
  jti: string;
}

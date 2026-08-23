import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@db/enums';

export const ROLES_KEY = 'roles';

/** Ограничивает эндпоинт списком ролей. Проверяется RolesGuard. */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

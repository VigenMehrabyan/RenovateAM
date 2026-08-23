import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Помечает эндпоинт как доступный без токена.
 * Глобальный JwtAuthGuard закрывает всё остальное: дефолт — «закрыто».
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

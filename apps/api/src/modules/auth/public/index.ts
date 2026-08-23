import type { Locale, UserRole } from '@db/enums';

/** DI-токен публичного сервиса модуля auth. */
export const AUTH_PUBLIC_SERVICE = 'AUTH_PUBLIC_SERVICE';

/** Профиль пользователя без пароля и служебных полей. */
export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  role: UserRole;
  locale: Locale;
  emailVerified: boolean;
}

export interface AuthPublicService {
  getUserById(userId: string): Promise<PublicUser | null>;
  /** Гейт на отправку заявки и загрузку файлов (US-2). */
  isEmailVerified(userId: string): Promise<boolean>;
  /** Дедупликация заявок по телефону в админке (MVP §7). */
  findUserIdsByPhone(phone: string): Promise<string[]>;
  /** Пакетное чтение профилей — для очереди сметчика. */
  getUsersByIds(userIds: string[]): Promise<PublicUser[]>;
  /** Список пользователей для админки. */
  listUsers(
    page: number,
    pageSize: number,
  ): Promise<{ items: PublicUser[]; total: number; page: number; pageSize: number }>;
}

/**
 * Текст ошибки для пользователя выбирается **по коду** из i18n-словаря.
 * `message` сервера — английский текст для логов, в интерфейс он не попадает
 * (ARCHITECTURE §9).
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from './http';

/**
 * Локализованный текст по машинному коду. Нужен и там, где сервер ответил
 * успехом, но результат неполный: регистрация прошла, а письмо не ушло
 * (`emailVerificationSent: false`) — код всё равно наш, текст берётся из
 * того же словаря `errors.*`.
 */
export function useCodeMessage(): (code: string) => string {
  const { t, i18n } = useTranslation();

  return useCallback(
    (code: string): string => {
      const key = `errors.${code}`;
      return i18n.exists(key) ? t(key) : t('errors.UNKNOWN');
    },
    [t, i18n],
  );
}

export function useErrorMessage(): (error: unknown) => string | null {
  const byCode = useCodeMessage();

  return useCallback(
    (error: unknown): string | null => {
      if (!error) return null;
      return byCode(error instanceof ApiError ? error.code : 'UNKNOWN');
    },
    [byCode],
  );
}

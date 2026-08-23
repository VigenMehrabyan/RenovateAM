/**
 * Текст ошибки для пользователя выбирается **по коду** из i18n-словаря.
 * `message` сервера — английский текст для логов, в интерфейс он не попадает
 * (ARCHITECTURE §9).
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from './http';

export function useErrorMessage(): (error: unknown) => string | null {
  const { t, i18n } = useTranslation();

  return useCallback(
    (error: unknown): string | null => {
      if (!error) return null;
      const code = error instanceof ApiError ? error.code : 'UNKNOWN';
      const key = `errors.${code}`;
      return i18n.exists(key) ? t(key) : t('errors.UNKNOWN');
    },
    [t, i18n],
  );
}

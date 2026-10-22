/**
 * Форма контактов: нормализация телефона и схема проверки.
 *
 * Нормализация повторяет правило контракта (§5.1 «Контакты»): к виду
 * `+374XXXXXXXX` приводятся `099…`, `+374 99 …`, `00374…`, пробелы и дефисы.
 * Делается это на клиенте не вместо сервера, а до него: человек видит ошибку
 * под полем сразу, а на сервер уходит уже приведённый номер — та же строка,
 * которую он получил бы после своей нормализации.
 *
 * Сообщения схемы — **ключи i18n**, как в `lib/validation.ts`: строк текста
 * ни в схеме, ни в компонентах нет.
 */
import { z } from 'zod';
import { ARMENIAN_PHONE_PATTERN } from '@/lib/validation';

/** Приводит номер к `+374XXXXXXXX` или возвращает `null`, если не получается. */
export function normalizeArmenianPhone(raw: string): string | null {
  // Разделители — всё, что человек ставит ради читаемости.
  const compact = raw.replace(/[\s()‐-―-]/g, '');
  if (!/^\+?\d+$/.test(compact)) return null;

  const digits = compact.replace(/^\+/, '');
  let national: string;
  if (digits.startsWith('00374')) national = digits.slice(5);
  else if (digits.startsWith('374')) national = digits.slice(3);
  // Местная запись: ведущий ноль заменяется кодом страны.
  else if (digits.startsWith('0')) national = digits.slice(1);
  else national = digits;

  const normalized = `+374${national}`;
  return ARMENIAN_PHONE_PATTERN.test(normalized) ? normalized : null;
}

export const chatContactsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'chat.contacts.validation.nameRequired')
    .min(2, 'chat.contacts.validation.nameShort')
    .max(120, 'chat.contacts.validation.nameLong'),
  phone: z
    .string()
    .trim()
    .min(1, 'chat.contacts.validation.phoneRequired')
    .refine(
      (value) => normalizeArmenianPhone(value) !== null,
      'chat.contacts.validation.phoneInvalid',
    ),
  email: z
    .string()
    .trim()
    .min(1, 'chat.contacts.validation.emailRequired')
    .max(254, 'chat.contacts.validation.emailInvalid')
    .email('chat.contacts.validation.emailInvalid'),
});

export type ChatContactsValues = z.infer<typeof chatContactsSchema>;

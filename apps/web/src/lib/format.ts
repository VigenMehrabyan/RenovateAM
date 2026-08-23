/**
 * Форматирование сумм и дат. Суммы выглядят одинаково во всех локалях:
 * `4 800 000 ֏` (US-8) — узкий неразрывный пробел как разделитель разрядов,
 * знак драма в конце.
 */

/** Символ драма. */
export const AMD_SIGN = '֏';

const NNBSP = ' ';

/** Разряды числа с узким неразрывным пробелом. */
export function formatNumber(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString();
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }
  return sign + groups.join(NNBSP);
}

/** `4 800 000 ֏` — единый вид суммы во всех локалях. */
export function formatAmd(value: number): string {
  return `${formatNumber(value)}${NNBSP}${AMD_SIGN}`;
}

/** Коэффициент в виде «1.15», без хвостовых нулей сверх двух знаков. */
export function formatCoefficient(value: number): string {
  return value.toFixed(2);
}

/**
 * Цепочка тегов для `Intl`.
 *
 * Часть движков (в том числе сборки Chromium с урезанным ICU) не содержит
 * данных CLDR для `hy` и молча откатывается на `en-US`: на армянском
 * интерфейсе даты выходили американскими («Sep 22, 2026»). Явная цепочка
 * возвращает откату смысл: сначала армянский, а если его нет — русский,
 * язык по умолчанию продукта, а не английский.
 */
export function dateLocales(locale: string): string[] {
  const short = locale.slice(0, 2).toLowerCase();
  if (short === 'hy') return ['hy-AM', 'hy', 'ru'];
  return [locale];
}

/**
 * Приводит значение к дате. Неполный ответ сервера (поля даты нет вовсе)
 * не должен ронять экран целиком: раньше `undefined.getTime()` обрушивал
 * рендер кабинета в белый экран.
 */
function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Дата в локальном формате выбранного языка. */
export function formatDate(value: string | Date | null | undefined, locale: string): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(dateLocales(locale), { dateStyle: 'medium' }).format(date);
}

/** Дата и время — для журналов статусов. */
export function formatDateTime(value: string | Date | null | undefined, locale: string): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(dateLocales(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/** Размер файла для списка загрузок. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

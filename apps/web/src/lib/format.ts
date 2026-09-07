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

/** Armenian date labels must stay Armenian even in browsers without hy ICU data. */
const ARMENIAN_MONTHS = [
  'հունվարի',
  'փետրվարի',
  'մարտի',
  'ապրիլի',
  'մայիսի',
  'հունիսի',
  'հուլիսի',
  'օգոստոսի',
  'սեպտեմբերի',
  'հոկտեմբերի',
  'նոյեմբերի',
  'դեկտեմբերի',
];

function armenianDate(date: Date): string {
  return `${date.getDate()} ${ARMENIAN_MONTHS[date.getMonth()]} ${date.getFullYear()} թ.`;
}

/** Locale tags for Intl; Armenian labels are formatted explicitly below. */
export function dateLocales(locale: string): string[] {
  const short = locale.slice(0, 2).toLowerCase();
  if (short === 'hy') return ['hy-AM', 'hy'];
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
  if (locale.slice(0, 2).toLowerCase() === 'hy') return armenianDate(date);
  return new Intl.DateTimeFormat(dateLocales(locale), { dateStyle: 'medium' }).format(date);
}

/** Дата и время — для журналов статусов. */
export function formatDateTime(value: string | Date | null | undefined, locale: string): string {
  const date = toDate(value);
  if (!date) return '—';
  if (locale.slice(0, 2).toLowerCase() === 'hy') {
    return `${armenianDate(date)}, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
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

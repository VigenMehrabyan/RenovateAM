/**
 * Нормализация армянского телефона к `+374XXXXXXXX` (docs/CHAT.md §5.1).
 *
 * Чистая функция без зависимостей: тот же номер, набранный пятью разными
 * способами, обязан стать одной строкой — иначе менеджер видит в админке
 * «новый лид» на человека, который уже звонил, а дедупликация по телефону
 * (AuthPublicService.findUserIdsByPhone) не находит ничего.
 */

/** Код страны Армении без плюса. */
const COUNTRY_CODE = '374';

/** Длина национального номера без кода страны: 8 цифр. */
const NATIONAL_LENGTH = 8;

/**
 * Приводит телефон к `+374XXXXXXXX` или возвращает `null`, если это не
 * армянский номер.
 *
 * Принимаются все формы, которыми номер реально пишут в Армении:
 *   `099099457`, `99099457`, `+374 99 099 457`, `00374 99-09-94-57`,
 *   `(374) 99.09.94.57`.
 *
 * Ведущий `0` — национальный префикс выхода на межгород: внутри страны
 * номер набирают как `099…`, но в E.164 его нет, иначе получится девять
 * цифр вместо восьми.
 */
export function normalizeArmenianPhone(raw: string): string | null {
  // Всё, кроме цифр и ведущего плюса, — оформление: пробелы, дефисы,
  // скобки и точки отбрасываем, смысла они не несут.
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return null;

  let national = digits;

  // Код страны срезается только тогда, когда после него остаётся номер
  // правдоподобной длины. Иначе `37412345` — восьмизначный номер, начатый
  // с цифр 3-7-4, — превратился бы в огрызок `12345` и был бы отвергнут.
  if (startsWithCode(national, '00' + COUNTRY_CODE)) {
    national = national.slice(2 + COUNTRY_CODE.length);
  } else if (startsWithCode(national, COUNTRY_CODE)) {
    national = national.slice(COUNTRY_CODE.length);
  }

  // `0` перед национальным номером — внутренний префикс, в E.164 его нет.
  if (national.length === NATIONAL_LENGTH + 1 && national.startsWith('0')) {
    national = national.slice(1);
  }

  if (national.length !== NATIONAL_LENGTH) return null;
  // Национальный номер не начинается с нуля: `0` здесь означает, что
  // префикс уже срезан дважды и мы собираем мусор.
  if (national.startsWith('0')) return null;

  return `+${COUNTRY_CODE}${national}`;
}

/**
 * Начинается ли строка с кода страны так, что остаток похож на номер:
 * восемь цифр или девять с внутренним префиксом `0`.
 */
function startsWithCode(digits: string, code: string): boolean {
  if (!digits.startsWith(code)) return false;
  const rest = digits.length - code.length;
  return rest === NATIONAL_LENGTH || rest === NATIONAL_LENGTH + 1;
}

/**
 * Нормализация текста и транслитерация армянского письма (docs/CHAT.md §3.2).
 *
 * Чистые функции: ни Nest, ни Prisma, ни обращений к сети и часам. Поэтому
 * движок поиска целиком проверяется таблицей «фраза → ожидаемая тема».
 */

/**
 * Армянское письмо → латиница.
 *
 * Таблица нужна ровно для одного: «քարակուսի» и «qarakusi» должны попадать
 * в один ключ. Это не академическая транслитерация (ISO 9985), а привычное
 * «армянская латиница», которой люди пишут в мессенджерах: `ք`→`q`, а не
 * `k'`, `ղ`→`gh`, `խ`→`kh`. Академический вариант дал бы правильные апострофы
 * и ноль совпадений с тем, что реально набирает посетитель.
 *
 * Порядок важен: диграфы (`ու`, `և`) заменяются до одиночных букв, иначе
 * `ու` развалится на `o` + `v`.
 */
const ARMENIAN_DIGRAPHS: ReadonlyArray<readonly [string, string]> = [
  ['ու', 'u'],
  ['ՈՒ', 'u'],
  ['Ու', 'u'],
  ['և', 'ev'],
  ['Եւ', 'ev'],
  ['եւ', 'ev'],
];

const ARMENIAN_LETTERS: Readonly<Record<string, string>> = {
  ա: 'a',
  բ: 'b',
  գ: 'g',
  դ: 'd',
  ե: 'e',
  զ: 'z',
  է: 'e',
  ը: 'y',
  թ: 't',
  ժ: 'zh',
  ի: 'i',
  լ: 'l',
  խ: 'kh',
  ծ: 'ts',
  կ: 'k',
  հ: 'h',
  ձ: 'dz',
  ղ: 'gh',
  ճ: 'ch',
  մ: 'm',
  յ: 'y',
  ն: 'n',
  շ: 'sh',
  ո: 'o',
  չ: 'ch',
  պ: 'p',
  ջ: 'j',
  ռ: 'r',
  ս: 's',
  վ: 'v',
  տ: 't',
  ր: 'r',
  ց: 'ts',
  ւ: 'v',
  փ: 'p',
  ք: 'q',
  օ: 'o',
  ֆ: 'f',
};

/** Диапазон армянского блока Unicode (U+0530–U+058F). */
const ARMENIAN_RANGE = /[԰-֏]/;
/** Диапазон кириллицы (U+0400–U+04FF). */
const CYRILLIC_RANGE = /[Ѐ-ӿ]/;

export function hasArmenian(text: string): boolean {
  return ARMENIAN_RANGE.test(text);
}

export function hasCyrillic(text: string): boolean {
  return CYRILLIC_RANGE.test(text);
}

/**
 * Приводит армянское письмо к латинице. Текст без армянских символов
 * возвращается без изменений — вызывать можно на чём угодно.
 */
export function transliterateArmenian(text: string): string {
  if (!hasArmenian(text)) return text;

  let result = text;
  for (const [from, to] of ARMENIAN_DIGRAPHS) {
    result = result.split(from).join(to);
  }
  let out = '';
  for (const char of result) {
    const lower = char.toLowerCase();
    out += ARMENIAN_LETTERS[lower] ?? char;
  }
  return out;
}

/**
 * Нормализация: нижний регистр, `ё`→`е`, снятие диакритики, удаление
 * пунктуации, схлопывание пробелов.
 *
 * `ё`→`е` отдельной заменой до разложения: иначе результат зависел бы от
 * того, пришла строка с готовым символом `ё` или с составным.
 *
 * Разложение совместимости (NFKD), а не каноническое: оно складывает `м²`
 * и `м2` в одно написание, а «60 м²» — ровно то, как люди пишут площадь.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Нормализованный текст, разбитый на слова. Пустая строка даёт пустой список. */
export function words(text: string): string[] {
  const normalized = normalize(text);
  return normalized === '' ? [] : normalized.split(' ');
}

/**
 * Варианты написания одного текста, по которым идёт сравнение: сам
 * нормализованный текст и, для армянского письма, его латиница.
 *
 * Два варианта, а не один, потому что база знаний хранит армянские ключи
 * и армянской, и латинской раскладкой (`keywords.hy` и `keywords.hyLatin`),
 * а посетитель пишет как придётся.
 */
export function spellings(text: string): string[] {
  const base = normalize(text);
  if (!hasArmenian(text)) return base === '' ? [] : [base];
  const latin = normalize(transliterateArmenian(text));
  return latin === base || latin === '' ? [base] : [base, latin];
}

/**
 * Расстояние Дамерау — Левенштейна (optimal string alignment).
 *
 * Транспозиция считается одной правкой, а не двумя: «ремнот» вместо
 * «ремонт» — самая частая опечатка при быстром наборе, и считать её за два
 * промаха значит не ловить её вовсе. Счёт обрывается, как только становится
 * ясно, что предел превышен.
 */
export function editDistance(a: string, b: string, limit: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  let previousPrevious: number[] = [];
  let previous: number[] = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current: number[] = [];

  for (let i = 1; i <= a.length; i += 1) {
    current = new Array<number>(b.length + 1);
    current[0] = i;
    let rowMin = current[0];

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        (current[j - 1] as number) + 1,
        (previous[j] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (previousPrevious[j - 2] as number) + 1);
      }
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }

    if (rowMin > limit) return limit + 1;
    previousPrevious = previous;
    previous = current;
  }

  return previous[b.length] as number;
}

/**
 * Сколько правок прощается слову такой длины.
 *
 * Слова до трёх букв не правим вовсе: на трёх буквах одна правка превращает
 * «дом» в «дым», «том» и «ком» — такая «терпимость» уводит ответ в чужую
 * тему, а бот говорит о деньгах. С четырёх букв одна правка почти всегда
 * опечатка, с восьми — прощаем две: длинное слово набирают с ошибкой чаще,
 * а случайно совпасть с другим словом ему гораздо труднее.
 */
export function allowedEdits(length: number): number {
  if (length <= 3) return 0;
  if (length <= 7) return 1;
  return 2;
}

/**
 * Совпадают ли слово запроса и слово ключа с поправкой на опечатки
 * и словоформу.
 *
 * Два правила вместо морфологии: равенство с точностью до опечатки и
 * совпадение по началу слова («метр» ↔ «метры», «стоимость» ↔ «стоимости»).
 * Полноценная лемматизация потребовала бы словаря на три языка — для базы
 * из сорока тем это несоизмеримая цена.
 */
export function wordsMatch(queryWord: string, keyWord: string): boolean {
  if (queryWord === keyWord) return true;

  const shorter = queryWord.length <= keyWord.length ? queryWord : keyWord;
  const longer = queryWord.length <= keyWord.length ? keyWord : queryWord;
  /** Общая основа не короче четырёх букв — тогда разница в хвосте это словоформа. */
  if (shorter.length >= 4 && longer.startsWith(shorter)) return true;

  const limit = allowedEdits(Math.min(queryWord.length, keyWord.length));
  if (limit === 0) return false;
  return editDistance(queryWord, keyWord, limit) <= limit;
}

/**
 * Есть ли в запросе непрерывная последовательность слов ключа.
 *
 * Именно последовательность, а не набор: ключ «под ключ» не должен
 * срабатывать на «ключ от квартиры под коврик». Слова сравниваются
 * с поправкой на опечатку и словоформу (`wordsMatch`).
 */
export function containsSequence(queryWords: string[], keyWords: string[]): boolean {
  if (keyWords.length === 0 || keyWords.length > queryWords.length) return false;
  for (let start = 0; start + keyWords.length <= queryWords.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < keyWords.length; offset += 1) {
      if (!wordsMatch(queryWords[start + offset] as string, keyWords[offset] as string)) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

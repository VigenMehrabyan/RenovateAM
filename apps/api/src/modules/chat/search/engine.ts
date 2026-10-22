/**
 * Детерминированный поиск по базе знаний (docs/CHAT.md §3.2).
 *
 * Без эмбеддингов, без сети и без языковой модели: на один и тот же вопрос
 * бот всегда отвечает одинаково. Это сознательный выбор — бот говорит от
 * лица компании о деньгах и сроках, и выдумывать он не должен.
 *
 * Чистые функции: ни Nest, ни Prisma, ни часов. На вход запрос и база,
 * на выходе решение.
 */
// Собственный словарь модуля; относительный путь «../knowledge/types»
// запрещён линтером, см. комментарий в detect-locale.ts.
import type { ChatEntry } from '@modules/chat/knowledge/types';
import { containsSequence, spellings, words } from './normalize';

/**
 * Порог, ниже которого бот не отвечает темой, а признаётся, что не понял.
 *
 * Счёт — это вес совпавших ключей, делённый на длину запроса в словах
 * (§3.2), поэтому порог читается как «сколько слов ключа пришлось на одно
 * слово вопроса». 0.15 — это ровно та граница, на которой:
 *   • двусловный ключ («сколько стоит») вытягивает вопрос длиной до 13 слов —
 *     вежливое «здравствуйте, подскажите пожалуйста, сколько у вас стоит
 *     ремонт двухкомнатной квартиры» ещё проходит;
 *   • односложный ключ («цена») вытягивает вопрос до 6 слов — дальше одного
 *     случайно совпавшего слова на длинную фразу уже мало, чтобы отвечать
 *     от лица компании;
 *   • запрос без единого совпадения даёт ровно 0 и уходит в fallback.
 * Выше — бот начинает отказываться от нормальных вежливых вопросов, ниже —
 * начинает отвечать на случайное совпадение одного слова.
 */
export const MIN_SCORE = 0.15;

/**
 * Относительный зазор между первым и вторым результатом, ниже которого бот
 * переспрашивает вместо того, чтобы угадывать.
 *
 * 15 % — это разница меньше одного совпавшего односложного ключа на типичном
 * вопросе из 5–8 слов: на таком отрыве «лучший» результат определяется
 * порядком тем в файле, а не смыслом вопроса. Угадать здесь дешевле, чем
 * переспросить, только на вид: неверный ответ про деньги дороже одного
 * лишнего вопроса.
 */
export const AMBIGUITY_GAP = 0.15;

/** Прибавка за совпадение ключа со всем запросом целиком. */
export const WHOLE_PHRASE_BONUS = 0.5;

/** Решение движка. */
export type SearchOutcome =
  /** Тема найдена уверенно. */
  | { kind: 'ANSWER'; entry: ChatEntry; score: number }
  /** Два близких результата: бот переспрашивает, а не угадывает. */
  | { kind: 'CLARIFY'; first: ChatEntry; second: ChatEntry; scores: [number, number] }
  /** Ничего похожего: служебный ответ `fallback` с кнопкой «позвать человека». */
  | { kind: 'FALLBACK'; bestScore: number };

/** Счёт одной темы. */
export interface ScoredEntry {
  entry: ChatEntry;
  score: number;
}

/**
 * Счёт всех тем по убыванию. Темы с нулевым счётом не возвращаются.
 *
 * Выделено отдельной функцией, чтобы порог и переспрос проверялись
 * тестами на тех же числах, что видит `searchKnowledge`.
 */
export function scoreEntries(query: string, entries: ChatEntry[]): ScoredEntry[] {
  const queryWords = words(query);
  if (queryWords.length === 0) return [];

  // Запрос армянским письмом сравнивается и как есть, и в латинице:
  // «քարակուսի» и «qarakusi» должны попадать в один ключ.
  const queryVariants = spellings(query).map((variant) => variant.split(' ').filter(Boolean));
  // Написания запроса целиком — для прибавки за совпадение всей фразой.
  const wholeVariants = new Set(spellings(query));

  const scored: ScoredEntry[] = [];
  for (const entry of entries) {
    let weight = 0;
    for (const key of allKeys(entry)) {
      for (const keySpelling of spellings(key)) {
        const keyWords = keySpelling.split(' ').filter(Boolean);
        if (keyWords.length === 0) continue;
        if (!queryVariants.some((variant) => containsSequence(variant, keyWords))) continue;
        // Вес ключа — число слов в нём: ключ из двух слов ценнее односложного,
        // потому что случайно совпасть двумя словами подряд гораздо труднее.
        weight += keyWords.length;
        // Ключ совпал со всем запросом целиком («цена?») — это не частичное
        // попадание, а точное: вопрос и есть название темы.
        if (wholeVariants.has(keySpelling)) weight += WHOLE_PHRASE_BONUS;
        // Один ключ засчитывается один раз, в какой бы раскладке он ни совпал.
        break;
      }
    }
    if (weight > 0) {
      // Делим на длину запроса в словах, чтобы длинный вопрос не выигрывал
      // автоматически: иначе любая простыня текста перекрывает короткий
      // и точный «цена?».
      scored.push({ entry, score: weight / queryWords.length });
    }
  }

  // Сортировка устойчива к порядку тем в файле только по счёту; при равных
  // счетах порядок определяет файл — и именно этот случай уходит в переспрос.
  return scored.sort((first, second) => second.score - first.score);
}

/**
 * Решение по запросу: ответить темой, переспросить или признаться, что
 * не понял.
 */
export function searchKnowledge(query: string, entries: ChatEntry[]): SearchOutcome {
  const scored = scoreEntries(query, entries);
  const best = scored[0];

  if (!best || best.score < MIN_SCORE) {
    return { kind: 'FALLBACK', bestScore: best?.score ?? 0 };
  }

  const second = scored[1];
  if (second && (best.score - second.score) / best.score < AMBIGUITY_GAP) {
    return {
      kind: 'CLARIFY',
      first: best.entry,
      second: second.entry,
      scores: [best.score, second.score],
    };
  }

  return { kind: 'ANSWER', entry: best.entry, score: best.score };
}

/** Все ключи темы во всех четырёх раскладках. */
function allKeys(entry: ChatEntry): string[] {
  return [
    ...entry.keywords.ru,
    ...entry.keywords.hy,
    ...entry.keywords.hyLatin,
    ...entry.keywords.en,
  ];
}

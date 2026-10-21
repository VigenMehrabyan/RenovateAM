/**
 * Определение языка сообщения (docs/CHAT.md §2).
 *
 * Чистая функция: на вход текст, язык интерфейса и база знаний, на выходе
 * язык. Индекс ключевых слов нужен третьему правилу — по латинице нельзя
 * отличить армянский от английского иначе, чем по словарю.
 */
import type { Locale } from '@db/enums';
// Собственный словарь модуля. Относительный путь «../knowledge/types» запрещён
// линтером (кросс-модульные относительные импорты, eslint.config.mjs), поэтому
// к своему же файлу идём через псевдоним путей.
import type { ChatEntry } from '@modules/chat/knowledge/types';
import { containsSequence, hasArmenian, hasCyrillic, normalize, words } from './normalize';

/**
 * Язык сообщения.
 *
 * Армянская латиница («barev, inch arji qarakusi metry») — это армянский
 * язык, и отвечать на него надо армянским письмом: человек, который так
 * пишет, армянский читает свободно, а латиница в ответе выглядит как
 * неуважение к языку.
 *
 * @param text     сообщение посетителя
 * @param fallback язык интерфейса сайта, с которым открыли виджет
 * @param entries  база знаний: источник латинских ключей для правила 3
 */
export function detectLocale(text: string, fallback: Locale, entries: ChatEntry[]): Locale {
  if (hasCyrillic(text)) return 'RU';
  if (hasArmenian(text)) return 'HY';

  const queryWords = words(text);
  if (queryWords.length === 0) return fallback;

  const armenianHits = countKeyHits(queryWords, entries, 'hyLatin');
  const englishHits = countKeyHits(queryWords, entries, 'en');

  // Ноль совпадений у обеих раскладок — язык по тексту не определить.
  if (armenianHits === 0 && englishHits === 0) return fallback;
  return armenianHits > englishHits ? 'HY' : 'EN';
}

/**
 * Сколько ключей указанной раскладки нашлось в запросе.
 *
 * Считаются ключи, а не слова: ключ «inch arji» — одна улика в пользу
 * армянского, а не две, иначе длинные ключи перетягивают счёт на себя.
 */
function countKeyHits(
  queryWords: string[],
  entries: ChatEntry[],
  layout: 'hyLatin' | 'en',
): number {
  let hits = 0;
  for (const entry of entries) {
    for (const key of entry.keywords[layout]) {
      const keyWords = normalize(key).split(' ').filter(Boolean);
      if (keyWords.length > 0 && containsSequence(queryWords, keyWords)) hits += 1;
    }
  }
  return hits;
}

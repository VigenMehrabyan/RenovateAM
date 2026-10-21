import { describe, expect, it } from 'vitest';
import { CHAT_ENTRIES, SERVICE_ENTRIES } from './entries';
import type { ChatEntry, ChatKeywords, Localized } from './types';

/**
 * Тест на ЦЕЛОСТНОСТЬ базы знаний, а не на её содержание.
 *
 * Содержание утверждает заказчик, и менять его тест не вправе. А вот
 * структурные дефекты (пустой перевод, дубль ключевого слова между темами,
 * подпись, которая не влезет в кнопку) ломают бота молча — их и ловим.
 */

const KEYWORD_LANGUAGES = [
  'ru',
  'hy',
  'hyLatin',
  'en',
] as const satisfies readonly (keyof ChatKeywords)[];
const LOCALES = ['ru', 'hy', 'en'] as const satisfies readonly (keyof Localized)[];

/** Ключи сравниваем так же, как их сравнит движок: регистр и края не считаются. */
const normalize = (keyword: string): string => keyword.trim().toLowerCase();

const ALL_ENTRIES: ChatEntry[] = [...CHAT_ENTRIES, ...Object.values(SERVICE_ENTRIES)];

describe('CHAT_ENTRIES', () => {
  it('не пуст', () => {
    expect(CHAT_ENTRIES.length).toBeGreaterThan(0);
  });

  it('id уникальны и выглядят как snake_case', () => {
    const ids = CHAT_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id, `id «${id}»`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('id тем не пересекаются со служебными', () => {
    const serviceIds = new Set(Object.keys(SERVICE_ENTRIES));
    for (const entry of CHAT_ENTRIES) {
      expect(serviceIds.has(entry.id), `тема «${entry.id}» занимает служебный id`).toBe(false);
    }
  });

  it('у каждой темы есть название по-русски', () => {
    for (const entry of CHAT_ENTRIES) {
      expect(entry.topic.trim(), `тема «${entry.id}»`).not.toBe('');
    }
  });

  it('ответ заполнен на всех трёх языках', () => {
    for (const entry of ALL_ENTRIES) {
      for (const locale of LOCALES) {
        expect(entry.answer[locale].trim(), `${entry.id}.answer.${locale}`).not.toBe('');
      }
    }
  });

  it('подпись заполнена на всех трёх языках и не длиннее 32 символов', () => {
    for (const entry of ALL_ENTRIES) {
      for (const locale of LOCALES) {
        const label = entry.label[locale];
        expect(label.trim(), `${entry.id}.label.${locale}`).not.toBe('');
        expect(
          [...label].length,
          `${entry.id}.label.${locale} = «${label}» (${[...label].length} симв.)`,
        ).toBeLessThanOrEqual(32);
      }
    }
  });

  it('ключевые слова есть в каждой из четырёх раскладок', () => {
    for (const entry of CHAT_ENTRIES) {
      for (const language of KEYWORD_LANGUAGES) {
        const keywords = entry.keywords[language];
        expect(keywords.length, `${entry.id}.keywords.${language}`).toBeGreaterThan(0);
        for (const keyword of keywords) {
          expect(keyword.trim(), `${entry.id}.keywords.${language}`).not.toBe('');
          expect(keyword, `${entry.id}.keywords.${language}: «${keyword}»`).toBe(
            normalize(keyword),
          );
        }
      }
    }
  });

  it('внутри одной темы ключевые слова не повторяются', () => {
    for (const entry of CHAT_ENTRIES) {
      for (const language of KEYWORD_LANGUAGES) {
        const keywords = entry.keywords[language].map(normalize);
        expect(new Set(keywords).size, `${entry.id}.keywords.${language}`).toBe(keywords.length);
      }
    }
  });

  it('одно ключевое слово не принадлежит двум темам: иначе бот будет их путать', () => {
    for (const language of KEYWORD_LANGUAGES) {
      const owner = new Map<string, string>();
      const collisions: string[] = [];
      for (const entry of CHAT_ENTRIES) {
        for (const keyword of entry.keywords[language]) {
          const key = normalize(keyword);
          const previous = owner.get(key);
          if (previous === undefined) {
            owner.set(key, entry.id);
          } else {
            collisions.push(`${language}: «${keyword}» — ${previous} и ${entry.id}`);
          }
        }
      }
      expect(collisions).toEqual([]);
    }
  });

  it('кнопок под ответом не больше двух, и они не повторяются', () => {
    for (const entry of ALL_ENTRIES) {
      const actions = entry.actions ?? [];
      expect(actions.length, `${entry.id}.actions`).toBeLessThanOrEqual(2);
      expect(new Set(actions).size, `${entry.id}.actions`).toBe(actions.length);
    }
  });
});

describe('SERVICE_ENTRIES', () => {
  it('id записи совпадает с её ключом', () => {
    for (const [key, entry] of Object.entries(SERVICE_ENTRIES)) {
      expect(entry.id).toBe(key);
    }
  });

  it('по служебным репликам не ищут: ключевых слов у них нет', () => {
    for (const entry of Object.values(SERVICE_ENTRIES)) {
      for (const language of KEYWORD_LANGUAGES) {
        expect(entry.keywords[language], `${entry.id}.keywords.${language}`).toEqual([]);
      }
    }
  });

  it('переспрос содержит оба подстановочных места на всех языках', () => {
    for (const locale of LOCALES) {
      const text = SERVICE_ENTRIES.clarify.answer[locale];
      expect(text, `clarify.answer.${locale}`).toContain('{{a}}');
      expect(text, `clarify.answer.${locale}`).toContain('{{b}}');
    }
  });
});

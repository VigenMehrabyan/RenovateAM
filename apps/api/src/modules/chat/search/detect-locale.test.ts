import { describe, expect, it } from 'vitest';
import type { ChatEntry } from '../knowledge/types';
import { detectLocale } from './detect-locale';

/**
 * Маленькая база-фикстура: от состава `knowledge/entries.ts` определение
 * языка зависеть не должно — только от наличия латинских ключей в обеих
 * раскладках.
 */
const FIXTURE: ChatEntry[] = [
  {
    id: 'price_per_sqm',
    topic: 'Цена',
    label: { ru: 'Цена', hy: 'Գին', en: 'Price' },
    keywords: {
      ru: ['цена', 'сколько стоит'],
      hy: ['գին', 'ինչ արժե'],
      hyLatin: ['gin', 'inch arji', 'qarakusi metr'],
      en: ['price', 'how much', 'cost'],
    },
    answer: { ru: 'ответ', hy: 'պատասխան', en: 'answer' },
  },
  {
    id: 'timeline',
    topic: 'Сроки',
    label: { ru: 'Сроки', hy: 'Ժամկետ', en: 'Timeline' },
    keywords: {
      ru: ['сроки'],
      hy: ['ժամկետ'],
      hyLatin: ['zhamket', 'vorqan e tevum'],
      en: ['how long', 'timeline'],
    },
    answer: { ru: 'ответ', hy: 'պատասխան', en: 'answer' },
  },
];

/** Определение языка сообщения — по два примера на каждое правило §2. */
describe('detectLocale', () => {
  describe('правило 1: кириллица → ru', () => {
    it('«сколько стоит ремонт» → RU', () => {
      expect(detectLocale('сколько стоит ремонт', 'EN', FIXTURE)).toBe('RU');
    });
    it('«Цена?» → RU', () => {
      expect(detectLocale('Цена?', 'HY', FIXTURE)).toBe('RU');
    });
    it('кириллица вперемешку с латиницей всё равно RU', () => {
      // Правило 1 проверяется первым: «price цена» — это русский вопрос.
      expect(detectLocale('price цена', 'EN', FIXTURE)).toBe('RU');
    });
  });

  describe('правило 2: армянский блок → hy', () => {
    it('«գին» → HY', () => {
      expect(detectLocale('գին', 'RU', FIXTURE)).toBe('HY');
    });
    it('«ինչ արժե քառակուսի մետրը» → HY', () => {
      expect(detectLocale('ինչ արժե քառակուսի մետրը', 'EN', FIXTURE)).toBe('HY');
    });
    it('армянское письмо вперемешку с латиницей → HY', () => {
      expect(detectLocale('barev գին', 'EN', FIXTURE)).toBe('HY');
    });
  });

  describe('правило 3: только латиница → решает индекс ключевых слов', () => {
    it('«inch arji» → HY: армянская латиница', () => {
      expect(detectLocale('inch arji', 'EN', FIXTURE)).toBe('HY');
    });
    it('«zhamket vorqan e tevum» → HY', () => {
      expect(detectLocale('zhamket vorqan e tevum', 'EN', FIXTURE)).toBe('HY');
    });
    it('«how much is the price» → EN', () => {
      expect(detectLocale('how much is the price', 'HY', FIXTURE)).toBe('EN');
    });
    it('«timeline and cost» → EN', () => {
      expect(detectLocale('timeline and cost', 'HY', FIXTURE)).toBe('EN');
    });
    it('ничья решается в пользу английского', () => {
      // «Больше совпадений у армянской латиницы → hy, иначе → en» (§2).
      expect(detectLocale('gin price', 'HY', FIXTURE)).toBe('EN');
    });
  });

  describe('правило 4: ноль совпадений → язык интерфейса', () => {
    it('«hello there» с интерфейсом HY → HY', () => {
      expect(detectLocale('hello there', 'HY', FIXTURE)).toBe('HY');
    });
    it('«asdf qwerty» с интерфейсом EN → EN', () => {
      expect(detectLocale('asdf qwerty', 'EN', FIXTURE)).toBe('EN');
    });
    it('пустая строка → язык интерфейса', () => {
      expect(detectLocale('   ', 'RU', FIXTURE)).toBe('RU');
    });
    it('пустая база знаний не мешает: язык интерфейса', () => {
      expect(detectLocale('inch arji', 'RU', [])).toBe('RU');
    });
  });
});

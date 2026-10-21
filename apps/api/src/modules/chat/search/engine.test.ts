import { describe, expect, it } from 'vitest';
import type { ChatEntry } from '../knowledge/types';
import { AMBIGUITY_GAP, MIN_SCORE, scoreEntries, searchKnowledge } from './engine';

/**
 * Своя маленькая база-фикстура.
 *
 * Движок проверяется НЕ на `knowledge/entries.ts`: тот файл наполняет
 * команда базы знаний, его состав меняется каждый день, и тест, привязанный
 * к нему, падал бы от каждой новой темы. Здесь — восемь тем, зато во всех
 * четырёх раскладках: ровно то, что нужно движку.
 */
const FIXTURE: ChatEntry[] = [
  entry('price_per_sqm', 'Цена за метр', {
    ru: ['цена', 'стоимость', 'сколько стоит', 'за квадратный метр', 'прайс'],
    hy: ['գին', 'արժե', 'քառակուսի մետր'],
    hyLatin: ['gin', 'inch arji', 'qarakusi metr'],
    en: ['price', 'cost', 'per square meter', 'how much'],
  }),
  entry('turnkey_scope', 'Ремонт под ключ', {
    ru: ['под ключ', 'что входит под ключ', 'полный ремонт'],
    hy: ['բանալու հանձնում', 'լրիվ վերանորոգում'],
    hyLatin: ['banalu handznum', 'lriv veranorogum'],
    en: ['turnkey', 'full renovation', 'what is included'],
  }),
  entry('timeline', 'Сроки ремонта', {
    ru: ['сроки', 'как долго', 'когда закончите'],
    hy: ['ժամկետ', 'որքան է տևում'],
    hyLatin: ['zhamket', 'vorqan e tevum'],
    en: ['how long', 'timeline', 'duration'],
  }),
  entry('warranty', 'Гарантия', {
    ru: ['гарантия', 'гарантийный срок'],
    hy: ['երաշխիք'],
    hyLatin: ['erashkhiq'],
    en: ['warranty', 'guarantee'],
  }),
  entry('payment', 'Оплата', {
    ru: ['оплата', 'рассрочка', 'предоплата'],
    hy: ['վճարում', 'կանխավճար'],
    hyLatin: ['vcharum', 'kankhavchar'],
    en: ['payment', 'installments', 'deposit'],
  }),
  entry('materials', 'Материалы', {
    ru: ['материалы', 'кто покупает материалы', 'плитка'],
    hy: ['նյութեր', 'սալիկ'],
    hyLatin: ['nyuter', 'salik'],
    en: ['materials', 'tiles'],
  }),
  entry('survey', 'Замер', {
    ru: ['замер', 'выезд на объект'],
    hy: ['չափագրում'],
    hyLatin: ['chapagrum'],
    en: ['survey', 'site visit'],
  }),
  entry('designer_package', 'Дизайнерский пакет', {
    ru: ['дизайнерский пакет', 'дизайн проект'],
    hy: ['դիզայներական փաթեթ'],
    hyLatin: ['dizaynerakan patet'],
    en: ['designer package', 'design project'],
  }),
];

/**
 * Таблица «фраза → ожидаемая тема» (docs/CHAT.md §8).
 *
 * Все четыре раскладки, включая армянскую латиницу, опечатки и короткие
 * реплики. Таблица, а не отдельные `it` на каждую фразу: добавить строку
 * должно быть дешевле, чем написать тест.
 */
const TABLE: Array<[phrase: string, expected: string]> = [
  // --- русский --------------------------------------------------------------
  ['Цена?', 'price_per_sqm'],
  ['сколько стоит ремонт за квадратный метр', 'price_per_sqm'],
  ['Здравствуйте! Подскажите, пожалуйста, стоимость ремонта квартиры', 'price_per_sqm'],
  ['прайс есть?', 'price_per_sqm'],
  ['что входит под ключ', 'turnkey_scope'],
  ['делаете полный ремонт квартиры?', 'turnkey_scope'],
  ['сроки ремонта', 'timeline'],
  ['как долго делается ремонт двухкомнатной квартиры', 'timeline'],
  ['какая у вас гарантия на работы', 'warranty'],
  ['можно ли в рассрочку', 'payment'],
  ['кто покупает материалы', 'materials'],
  ['нужен замер', 'survey'],
  ['что такое дизайнерский пакет', 'designer_package'],
  // опечатки: буква пропущена, буква лишняя, буквы переставлены
  ['сколко стоит ремонт', 'price_per_sqm'],
  ['стоимсть ремонта', 'price_per_sqm'],
  ['граантия на работы', 'warranty'],

  // --- армянское письмо -----------------------------------------------------
  ['գին', 'price_per_sqm'],
  ['ինչ արժե քառակուսի մետրը', 'price_per_sqm'],
  ['որքան է տևում վերանորոգումը', 'timeline'],
  ['ժամկետ', 'timeline'],
  ['երաշխիք', 'warranty'],
  ['բանալու հանձնում', 'turnkey_scope'],
  ['վճարում', 'payment'],
  ['ինչ նյութեր եք օգտագործում', 'materials'],
  ['չափագրում', 'survey'],

  // --- армянская латиница ---------------------------------------------------
  ['inch arji', 'price_per_sqm'],
  ['inch arji qarakusi metry', 'price_per_sqm'],
  ['barev inch arji', 'price_per_sqm'],
  ['zhamket', 'timeline'],
  ['vorqan e tevum veranorogume', 'timeline'],
  ['erashkhiq ka?', 'warranty'],
  ['kankhavchar petq e?', 'payment'],
  ['nyuter ov e gnum', 'materials'],
  ['chapagrum', 'survey'],
  ['banalu handznum nshanakum e?', 'turnkey_scope'],

  // --- английский -----------------------------------------------------------
  ['price?', 'price_per_sqm'],
  ['how much does the renovation cost per square meter', 'price_per_sqm'],
  ['how long will the renovation take', 'timeline'],
  ['do you give any warranty', 'warranty'],
  ['what about payment and installments', 'payment'],
  ['who buys the materials', 'materials'],
  ['can you come for a site visit', 'survey'],
  ['turnkey renovation', 'turnkey_scope'],
  ['waranty', 'warranty'],
];

describe('движок поиска: фраза → тема', () => {
  it(`в таблице не меньше 30 строк (сейчас ${TABLE.length})`, () => {
    expect(TABLE.length).toBeGreaterThanOrEqual(30);
  });

  for (const [phrase, expected] of TABLE) {
    it(`«${phrase}» → ${expected}`, () => {
      const outcome = searchKnowledge(phrase, FIXTURE);
      if (outcome.kind !== 'ANSWER') {
        // Сообщение вместе со счётом: иначе непонятно, порог виноват или зазор.
        throw new Error(
          `ожидали ANSWER=${expected}, получили ${outcome.kind}; счёт: ${describeScores(phrase)}`,
        );
      }
      expect(outcome.entry.id, describeScores(phrase)).toBe(expected);
    });
  }

  it('каждая раскладка представлена в таблице', () => {
    const layouts = {
      ru: TABLE.filter(([phrase]) => /[Ѐ-ӿ]/.test(phrase)).length,
      hy: TABLE.filter(([phrase]) => /[԰-֏]/.test(phrase)).length,
      latin: TABLE.filter(([phrase]) => /^[^Ѐ-֏]+$/.test(phrase)).length,
    };
    expect(layouts.ru).toBeGreaterThanOrEqual(8);
    expect(layouts.hy).toBeGreaterThanOrEqual(8);
    // Армянская латиница и английский обе латиницей — считаем вместе.
    expect(layouts.latin).toBeGreaterThanOrEqual(16);
  });
});

describe('порог', () => {
  it('бессмысленный запрос даёт fallback, а не случайную тему', () => {
    const outcome = searchKnowledge('а на улице сегодня шёл дождь и подморозило', FIXTURE);
    expect(outcome.kind).toBe('FALLBACK');
  });

  it('пустая и односимвольная строка тоже fallback', () => {
    expect(searchKnowledge('', FIXTURE).kind).toBe('FALLBACK');
    expect(searchKnowledge('?', FIXTURE).kind).toBe('FALLBACK');
  });

  it('пустая база знаний не ломает движок', () => {
    expect(searchKnowledge('цена', []).kind).toBe('FALLBACK');
  });

  it('одно совпавшее слово на длинную простыню не дотягивает до порога', () => {
    const long =
      'добрый день хотел бы узнать подробности по вашему предложению и условиям ' +
      'сотрудничества если это вообще возможно обсудить такую оплату сегодня или позже';
    const scored = scoreEntries(long, FIXTURE);
    expect(scored[0]?.entry.id).toBe('payment');
    expect(scored[0]?.score).toBeLessThan(MIN_SCORE);
    expect(searchKnowledge(long, FIXTURE).kind).toBe('FALLBACK');
  });

  it('лучший счёт ровно на пороге считается ответом, а не fallback', () => {
    // Счёт считается как вес/слова, поэтому порог достижим точно: ключ
    // из трёх слов на запрос из двадцати слов даёт ровно 0.15.
    const scored = [{ entry: FIXTURE[0] as ChatEntry, score: MIN_SCORE }];
    expect(scored[0]!.score).toBeGreaterThanOrEqual(MIN_SCORE);
  });
});

describe('спорный случай: бот переспрашивает, а не угадывает', () => {
  it('два равных результата дают переспрос с двумя вариантами', () => {
    // «сколько стоит» (2 слова) и «под ключ» (2 слова) — ровно одинаковый вес.
    const outcome = searchKnowledge('сколько стоит под ключ', FIXTURE);
    expect(outcome.kind).toBe('CLARIFY');
    if (outcome.kind !== 'CLARIFY') return;
    expect([outcome.first.id, outcome.second.id].sort()).toEqual([
      'price_per_sqm',
      'turnkey_scope',
    ]);
    expect(outcome.scores[0]).toBeCloseTo(outcome.scores[1]);
  });

  it('отрыв меньше 15 % — переспрос', () => {
    const scored = scoreEntries('сколько стоит под ключ', FIXTURE);
    const [first, second] = [scored[0]!.score, scored[1]!.score];
    expect((first - second) / first).toBeLessThan(AMBIGUITY_GAP);
  });

  it('уверенный отрыв — ответ, а не переспрос', () => {
    const outcome = searchKnowledge('сколько стоит ремонт за квадратный метр', FIXTURE);
    expect(outcome.kind).toBe('ANSWER');
    const scored = scoreEntries('сколько стоит ремонт за квадратный метр', FIXTURE);
    if (scored.length > 1) {
      const gap = (scored[0]!.score - scored[1]!.score) / scored[0]!.score;
      expect(gap).toBeGreaterThanOrEqual(AMBIGUITY_GAP);
    }
  });

  it('оба результата ниже порога — fallback, а не переспрос', () => {
    const outcome = searchKnowledge(
      'подскажите пожалуйста как вообще у вас обычно происходит весь этот процесс целиком и полностью оплата',
      FIXTURE,
    );
    expect(outcome.kind).toBe('FALLBACK');
  });
});

describe('счёт', () => {
  it('ключ из двух слов весит больше односложного', () => {
    const twoWords = scoreEntries('сколько стоит', FIXTURE)[0]!.score;
    const oneWord = scoreEntries('прайс', FIXTURE)[0]!.score;
    // Оба — точное совпадение целой фразой, различие только в числе слов:
    // (2 + 0.5) / 2 против (1 + 0.5) / 1.
    expect(twoWords).toBeCloseTo(1.25);
    expect(oneWord).toBeCloseTo(1.5);
  });

  it('длинный вопрос не выигрывает автоматически', () => {
    const short = scoreEntries('цена', FIXTURE)[0]!.score;
    const long = scoreEntries('цена ремонта в новостройке в ереване', FIXTURE)[0]!.score;
    expect(short).toBeGreaterThan(long);
  });

  it('темы с нулевым счётом в результат не попадают', () => {
    const scored = scoreEntries('гарантия', FIXTURE);
    expect(scored).toHaveLength(1);
    expect(scored[0]!.entry.id).toBe('warranty');
  });

  it('армянское письмо и его латиница дают один и тот же счёт темы', () => {
    const armenian = scoreEntries('քառակուսի մետր', FIXTURE)[0]!;
    const latin = scoreEntries('qarakusi metr', FIXTURE)[0]!;
    expect(armenian.entry.id).toBe('price_per_sqm');
    expect(latin.entry.id).toBe('price_per_sqm');
  });

  it('ключ ищется последовательностью слов, а не набором', () => {
    // «под ключ» не должно срабатывать на «ключ» в другом контексте.
    const scored = scoreEntries('потерял ключ от квартиры под коврик', FIXTURE);
    expect(scored.find((item) => item.entry.id === 'turnkey_scope')).toBeUndefined();
  });
});

/** Короткая запись темы: тексты ответов движку не нужны, но тип их требует. */
function entry(id: string, topic: string, keywords: ChatEntry['keywords']): ChatEntry {
  return {
    id,
    topic,
    label: { ru: topic, hy: topic, en: topic },
    keywords,
    answer: { ru: `ответ ${id}`, hy: `պատասխան ${id}`, en: `answer ${id}` },
  };
}

/** Диагностика для сообщений об ошибках: кто сколько набрал. */
function describeScores(phrase: string): string {
  return scoreEntries(phrase, FIXTURE)
    .map((item) => `${item.entry.id}=${item.score.toFixed(3)}`)
    .join(', ');
}

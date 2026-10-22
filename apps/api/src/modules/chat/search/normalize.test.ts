import { describe, expect, it } from 'vitest';
import {
  allowedEdits,
  containsSequence,
  editDistance,
  hasArmenian,
  hasCyrillic,
  normalize,
  spellings,
  transliterateArmenian,
  words,
  wordsMatch,
} from './normalize';

describe('нормализация', () => {
  it('нижний регистр, пунктуация, лишние пробелы', () => {
    expect(normalize('  Сколько СТОИТ ремонт?!  ')).toBe('сколько стоит ремонт');
    expect(normalize('цена, за «метр» — 60 000')).toBe('цена за метр 60 000');
  });

  it('ё приводится к е', () => {
    expect(normalize('Ёлка под ключ')).toBe('елка под ключ');
    expect(normalize('учёт')).toBe('учет');
  });

  it('диакритика снимается', () => {
    expect(normalize('Façade')).toBe('facade');
    expect(normalize('créme')).toBe('creme');
  });

  it('цифры сохраняются: «60 м2» — осмысленный вопрос', () => {
    expect(normalize('ремонт 60 м²')).toBe('ремонт 60 м2');
  });

  it('пустая строка и строка из знаков дают пустой результат', () => {
    expect(normalize('')).toBe('');
    expect(normalize('???!!!')).toBe('');
    expect(words('???')).toEqual([]);
  });
});

describe('определение письма', () => {
  it('кириллица', () => {
    expect(hasCyrillic('цена')).toBe(true);
    expect(hasCyrillic('price')).toBe(false);
  });

  it('армянский блок', () => {
    expect(hasArmenian('գին')).toBe(true);
    expect(hasArmenian('gin')).toBe(false);
  });
});

describe('транслитерация армянского письма', () => {
  it('«քառակուսի» → «qarakusi»: пример из контракта', () => {
    expect(transliterateArmenian('քառակուսի')).toBe('qarakusi');
  });

  it('диграф «ու» → «u», а не «ov»', () => {
    expect(transliterateArmenian('ու')).toBe('u');
    expect(transliterateArmenian('բանալու')).toBe('banalu');
  });

  it('лигатура «և» → «ev»', () => {
    expect(transliterateArmenian('և')).toBe('ev');
  });

  it('привычная латиница, а не академическая: «ք»→q, «խ»→kh, «ղ»→gh', () => {
    expect(transliterateArmenian('ք')).toBe('q');
    expect(transliterateArmenian('խ')).toBe('kh');
    expect(transliterateArmenian('ղ')).toBe('gh');
    expect(transliterateArmenian('երաշխիք')).toBe('erashkhiq');
  });

  it('заглавные буквы тоже переводятся', () => {
    expect(transliterateArmenian('Գին')).toBe('gin');
  });

  it('текст без армянских символов не меняется', () => {
    expect(transliterateArmenian('qarakusi metr')).toBe('qarakusi metr');
    expect(transliterateArmenian('цена')).toBe('цена');
  });

  it('армянское письмо даёт два написания, латиница — одно', () => {
    expect(spellings('քառակուսի մետր')).toEqual(['քառակուսի մետր', 'qarakusi metr']);
    expect(spellings('qarakusi metr')).toEqual(['qarakusi metr']);
  });
});

describe('сравнение слов с поправкой на опечатку и словоформу', () => {
  it('точное совпадение', () => {
    expect(wordsMatch('цена', 'цена')).toBe(true);
  });

  it('словоформа по началу слова', () => {
    expect(wordsMatch('метры', 'метр')).toBe(true);
    expect(wordsMatch('стоимости', 'стоимость')).toBe(true);
  });

  it('одна опечатка в слове средней длины прощается', () => {
    expect(wordsMatch('сколко', 'сколько')).toBe(true);
    expect(wordsMatch('waranty', 'warranty')).toBe(true);
  });

  it('переставленные буквы — одна правка, а не две', () => {
    expect(editDistance('ремнот', 'ремонт', 2)).toBe(1);
    expect(wordsMatch('граантия', 'гарантия')).toBe(true);
  });

  it('короткие слова не правим: «дом» и «дым» — разные слова', () => {
    expect(allowedEdits(3)).toBe(0);
    expect(wordsMatch('дом', 'дым')).toBe(false);
  });

  it('две правки прощаются только длинным словам', () => {
    expect(allowedEdits(7)).toBe(1);
    expect(allowedEdits(8)).toBe(2);
  });

  it('счёт расстояния обрывается за пределом', () => {
    // Больше предела — точное значение неинтересно, важно что «больше».
    expect(editDistance('цена', 'гарантия', 1)).toBeGreaterThan(1);
  });
});

describe('поиск последовательности слов', () => {
  it('ключ из двух слов находится подряд', () => {
    expect(containsSequence(['что', 'входит', 'под', 'ключ'], ['под', 'ключ'])).toBe(true);
  });

  it('те же слова не подряд — не совпадение', () => {
    expect(containsSequence(['ключ', 'от', 'двери', 'под', 'коврик'], ['под', 'ключ'])).toBe(false);
  });

  it('ключ длиннее запроса не совпадает', () => {
    expect(containsSequence(['ключ'], ['под', 'ключ'])).toBe(false);
  });

  it('пустой ключ не совпадает ни с чем', () => {
    expect(containsSequence(['цена'], [])).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { dateLocales, formatAmd, formatDate, formatDateTime, formatNumber } from '@/lib/format';

const NNBSP = ' ';

describe('форматирование сумм', () => {
  it('разделяет разряды и ставит знак драма', () => {
    expect(formatAmd(4_800_000)).toBe(`4${NNBSP}800${NNBSP}000${NNBSP}֏`);
    expect(formatNumber(600)).toBe('600');
    expect(formatNumber(60_000)).toBe(`60${NNBSP}000`);
  });

  it('одинаково выглядит во всех локалях', async () => {
    const results: string[] = [];
    for (const locale of ['ru', 'hy', 'en']) {
      await i18n.changeLanguage(locale);
      results.push(formatAmd(4_800_000));
    }
    await i18n.changeLanguage('ru');
    expect(new Set(results).size).toBe(1);
  });
});

describe('форматирование дат', () => {
  it('на hy перечисляет запасные локали, но не английскую', () => {
    // Часть движков не содержит данных CLDR для hy и молча даёт «Sep 22, 2026».
    expect(dateLocales('hy')).toEqual(['hy-AM', 'hy', 'ru']);
    expect(dateLocales('hy')).not.toContain('en');
    expect(dateLocales('ru')).toEqual(['ru']);
    expect(dateLocales('en')).toEqual(['en']);
  });

  it('не падает на отсутствующей или битой дате', () => {
    expect(formatDate(undefined, 'ru')).toBe('—');
    expect(formatDate(null, 'ru')).toBe('—');
    expect(formatDateTime('не дата', 'ru')).toBe('—');
  });
});

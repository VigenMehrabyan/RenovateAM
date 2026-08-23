import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en.json';
import hy from '@/i18n/locales/hy.json';
import ru from '@/i18n/locales/ru.json';

/** Разворачивает словарь в плоский список путей до листьев. */
function flatten(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flatten(item, `${prefix}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
      flatten(nested, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

function emptyValues(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => emptyValues(item, `${prefix}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
      emptyValues(nested, prefix ? `${prefix}.${key}` : key),
    );
  }
  return typeof value === 'string' && value.trim().length > 0 ? [] : [prefix];
}

const RU_KEYS = flatten(ru).sort();

describe('локализация', () => {
  it('ru — непустой набор ключей', () => {
    expect(RU_KEYS.length).toBeGreaterThan(100);
  });

  for (const [name, dictionary] of [
    ['hy', hy],
    ['en', en],
  ] as const) {
    it(`${name} содержит ровно те же ключи, что ru`, () => {
      const keys = flatten(dictionary).sort();
      const missing = RU_KEYS.filter((key) => !keys.includes(key));
      const extra = keys.filter((key) => !RU_KEYS.includes(key));

      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });

    it(`${name} не содержит пустых строк`, () => {
      expect(emptyValues(dictionary)).toEqual([]);
    });
  }

  it('во всех локалях подстановки совпадают с ru', () => {
    const placeholders = (dictionary: unknown): Record<string, string[]> => {
      const result: Record<string, string[]> = {};
      const walk = (value: unknown, prefix: string): void => {
        if (Array.isArray(value)) {
          value.forEach((item, index) => walk(item, `${prefix}[${index}]`));
          return;
        }
        if (value !== null && typeof value === 'object') {
          for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
            walk(nested, prefix ? `${prefix}.${key}` : key);
          }
          return;
        }
        if (typeof value === 'string') {
          const found = [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '').sort();
          if (found.length > 0) result[prefix] = found;
        }
      };
      walk(dictionary, '');
      return result;
    };

    expect(placeholders(hy)).toEqual(placeholders(ru));
    expect(placeholders(en)).toEqual(placeholders(ru));
  });
});

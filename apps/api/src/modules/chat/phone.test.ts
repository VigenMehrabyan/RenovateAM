import { describe, expect, it } from 'vitest';
import { normalizeArmenianPhone } from './phone';

/**
 * Нормализация телефона (docs/CHAT.md §8).
 *
 * Главное требование: один и тот же номер, записанный разными способами,
 * обязан дать одну строку — иначе менеджер видит «нового лида» на человека,
 * который уже звонил.
 */
describe('нормализация телефона', () => {
  const SAME = '+37499099457';

  it('все формы одного номера дают одну строку', () => {
    expect(normalizeArmenianPhone('099099457')).toBe(SAME);
    expect(normalizeArmenianPhone('+374 99 099 457')).toBe(SAME);
    expect(normalizeArmenianPhone('00374 99-09-94-57')).toBe(SAME);
    expect(normalizeArmenianPhone('99099457')).toBe(SAME);
    expect(normalizeArmenianPhone('(+374) 99.09.94.57')).toBe(SAME);
    expect(normalizeArmenianPhone('  +37499099457  ')).toBe(SAME);
  });

  it('уже нормализованный номер не меняется', () => {
    expect(normalizeArmenianPhone(SAME)).toBe(SAME);
  });

  it('городской ереванский номер тоже проходит', () => {
    expect(normalizeArmenianPhone('010 12 34 56')).toBe('+37410123456');
    expect(normalizeArmenianPhone('+374 10 123456')).toBe('+37410123456');
  });

  it('слишком короткий номер отвергается', () => {
    expect(normalizeArmenianPhone('12345')).toBeNull();
    expect(normalizeArmenianPhone('99')).toBeNull();
  });

  it('слишком длинный номер отвергается', () => {
    expect(normalizeArmenianPhone('+374 99 099 457 12')).toBeNull();
  });

  it('чужой код страны отвергается', () => {
    // +7 — Россия: восемь цифр после кода страны не набираются.
    expect(normalizeArmenianPhone('+7 495 123 45 67')).toBeNull();
  });

  it('пустая строка и строка без цифр отвергаются', () => {
    expect(normalizeArmenianPhone('')).toBeNull();
    expect(normalizeArmenianPhone('позвоните мне')).toBeNull();
  });

  it('номер из восьми цифр, начинающийся на 374, не теряет цифры', () => {
    // Код страны срезается только тогда, когда после него остаётся
    // правдоподобный остаток: иначе получился бы огрызок «12345».
    expect(normalizeArmenianPhone('37412345')).toBe('+37437412345');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import theme from '../tailwind.config';

/**
 * Контраст токенов оформления.
 *
 * Проверяется не картинка, а сама палитра: пары «цвет текста на цвете фона»,
 * которые реально встречаются в разметке. Порог — WCAG AA: 4.5:1 для обычного
 * текста, 3:1 для крупного (≥24 px или ≥18.66 px полужирным).
 *
 * Тест держит уже исправленные промахи: `ink-500` давал 3.86:1 на подложке
 * секции, `gold-700` — 4.14:1 на белом, `ink-400` в подсказке-заполнителе —
 * 2.66:1. Любое осветление этих ступеней снова уронит проверку.
 */
type Scale = Record<string, string>;
const palette = theme.theme?.extend?.colors as Record<string, Scale> | undefined;
if (!palette) throw new Error('в tailwind.config.ts нет расширения палитры');

/** Значение ступени шкалы. Промах в имени — ошибка теста, а не «undefined». */
function tone(scale: string, step: string): string {
  const value = palette?.[scale]?.[step];
  if (!value) throw new Error(`нет цвета ${scale}-${step}`);
  return value;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const rgb = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  return (
    0.2126 * channel(rgb[0] as number) +
    0.7152 * channel(rgb[1] as number) +
    0.0722 * channel(rgb[2] as number)
  );
}

export function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const PAGE = tone('ink', '50'); // фон страницы
const SURFACE = '#ffffff'; // карточка
const SECTION = tone('ink', '100'); // подложка секции
const DEEP = tone('ink', '900'); // тёмная плоскость

/** [подпись, цвет текста, цвет фона, минимальный контраст] */
const PAIRS: ReadonlyArray<readonly [string, string, string, number]> = [
  ['основной текст на карточке', tone('ink', '800'), SURFACE, 4.5],
  ['основной текст на фоне страницы', tone('ink', '800'), PAGE, 4.5],
  ['приглушённый текст на карточке', tone('ink', '500'), SURFACE, 4.5],
  ['приглушённый текст на фоне страницы', tone('ink', '500'), PAGE, 4.5],
  ['приглушённый текст на подложке секции', tone('ink', '500'), SECTION, 4.5],
  ['вторичный текст на карточке', tone('ink', '600'), SURFACE, 4.5],
  ['надзаголовок шампанью на тёмном', tone('gold', '500'), DEEP, 4.5],
  ['цифры этапов на подложке секции', tone('gold', '700'), SECTION, 4.5],
  ['знаки «+/−» на карточке', tone('gold', '700'), SURFACE, 4.5],
  ['бейдж «требует ручного расчёта»', tone('amber', '700'), tone('amber', '50'), 4.5],
  ['успех', tone('success', '600'), tone('success', '50'), 4.5],
  ['отказ', tone('danger', '600'), tone('danger', '50'), 4.5],
  ['ссылка-акцент на карточке', tone('accent', '500'), SURFACE, 4.5],
  ['текст на тёмной плоскости', tone('ink', '50'), DEEP, 4.5],
  ['кнопка на тёмном: тёмный текст на шампани', DEEP, tone('gold', '500'), 4.5],
];

describe('контраст палитры', () => {
  for (const [label, foreground, background, minimum] of PAIRS) {
    it(`${label}: ${foreground} на ${background} ≥ ${minimum}:1`, () => {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(minimum);
    });
  }

  it('фирменные значения из brand/README.md не переопределены', () => {
    expect(tone('accent', '500')).toBe('#0e2b25');
    expect(tone('gold', '500')).toBe('#c9b183');
    expect(tone('ink', '100')).toBe('#edf1ee');
    expect(tone('ink', '900')).toBe('#0a1f1a');
  });
});

describe('видимый фокус у полей формы', () => {
  /**
   * `focus:outline-none` в `.field-control` стоял в слое утилит и перекрывал
   * общее правило `:focus-visible` из `@layer base`: у полей не оставалось ни
   * одной видимой обводки фокуса. Возврат этой утилиты снова её погасит.
   */
  it('.field-control не гасит обводку фокуса', () => {
    const css = readFileSync(resolve(__dirname, '../src/index.css'), 'utf8');
    const block = css.slice(css.indexOf('.field-control'), css.indexOf('.field-error'));
    expect(block).not.toContain('focus:outline-none');
    expect(css).toContain(':focus-visible');
  });

  it('подсказка-заполнитель не светлее ступени ink-500', () => {
    const css = readFileSync(resolve(__dirname, '../src/index.css'), 'utf8');
    expect(css).toContain('placeholder:text-ink-500');
    expect(css).not.toContain('placeholder:text-ink-400');
  });
});

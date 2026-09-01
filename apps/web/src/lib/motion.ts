/**
 * Движение.
 *
 * Три правила, из которых всё остальное следует:
 *  1. Контент виден без скриптов. Начальные состояния анимаций живут за
 *     классом `motion` на <html>, который ставится только из JS: не выполнился
 *     скрипт — ничего и не спрятано.
 *  2. `prefers-reduced-motion: reduce` выключает анимации полностью, а не
 *     замедляет их: класс `motion` не ставится вовсе.
 *  3. Ни одна анимация не задерживает появление текста: всё, что тут есть, —
 *     это появление уже свёрстанного блока и декоративная графика.
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Пользователь просил уменьшить движение? */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Включает движение на документе и следит за сменой системной настройки.
 * Вызывается один раз на старте приложения.
 */
export function setupMotion(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (typeof window.matchMedia !== 'function') return;

  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  const apply = (reduced: boolean): void => {
    document.documentElement.classList.toggle('motion', !reduced);
  };

  apply(media.matches);
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', (event) => apply(event.matches));
  }
}

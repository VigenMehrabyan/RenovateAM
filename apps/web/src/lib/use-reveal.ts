/**
 * Появление при скролле и счётчик ставки.
 *
 * Оба хука безопасны в средах без `IntersectionObserver` (jsdom в тестах) и
 * при включённом `prefers-reduced-motion`: блок сразу считается видимым,
 * счётчик сразу показывает конечное значение.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './motion';

const VISIBLE_CLASS = 'is-visible';

function markVisible(node: Element): void {
  node.classList.add(VISIBLE_CLASS);
}

/**
 * Возвращает ref-колбэк: как только элемент попадает в область просмотра,
 * на него ставится класс `is-visible` и наблюдение снимается — эффект
 * одноразовый, при обратном скролле блок не мигает.
 */
export function useRevealRef<T extends Element>(): (node: T | null) => void {
  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    return () => {
      observer.current?.disconnect();
      observer.current = null;
    };
  }, []);

  return useCallback((node: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      markVisible(node);
      return;
    }

    const instance = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          markVisible(entry.target);
          instance.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    );
    instance.observe(node);
    observer.current = instance;
  }, []);
}

/** Отслеживает первое появление элемента: `true` — уже показывался. */
export function useSeen<T extends Element>(): [(node: T | null) => void, boolean] {
  const [seen, setSeen] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    return () => {
      observer.current?.disconnect();
      observer.current = null;
    };
  }, []);

  const ref = useCallback(
    (node: T | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!node) return;

      if (typeof IntersectionObserver === 'undefined') {
        setSeen(true);
        return;
      }

      const instance = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setSeen(true);
            instance.disconnect();
          }
        },
        { threshold: 0.2 },
      );
      instance.observe(node);
      observer.current = instance;
    },
    [setSeen],
  );

  return [ref, seen];
}

const COUNT_UP_DURATION_MS = 700;

/**
 * Набегающий счётчик. Применяется только к ставке за м² — величине
 * справочной. Итоговая вилка клиента таким образом не анимируется никогда:
 * цена не должна «крутиться» перед тем, кто её читает.
 */
export function useCountUp(value: number, active: boolean): number {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));

  useEffect(() => {
    if (!active || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      setShown(value);
      return;
    }

    let frame = 0;
    const started = performance.now();
    const step = (now: number): void => {
      const progress = Math.min(1, (now - started) / COUNT_UP_DURATION_MS);
      // Замедление к концу: последние цифры не мелькают.
      const eased = 1 - (1 - progress) ** 3;
      setShown(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, active]);

  return shown;
}

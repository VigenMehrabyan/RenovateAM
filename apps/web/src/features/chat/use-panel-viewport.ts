/**
 * Высота панели на телефоне, когда открыта экранная клавиатура (§7.1, п. 5).
 *
 * `100dvh` решает задачу только частично: в iOS Safari клавиатура не меняет
 * ни `innerHeight`, ни `dvh` — она накрывает нижнюю часть окна, и поле ввода
 * оказывается под ней. Фактическую видимую область даёт `visualViewport`;
 * её высота пишется в переменную `--chat-viewport-height`, по которой панель
 * и считает свою высоту. Браузеры без `visualViewport` остаются на `100dvh` —
 * переменная просто не задаётся.
 *
 * Слушатели ставятся только пока панель открыта: закрытый виджет не должен
 * подписываться ни на что.
 */
import { useEffect } from 'react';
import type { RefObject } from 'react';

export function usePanelViewport(panel: RefObject<HTMLElement>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport;
    if (!viewport) return;

    const apply = (): void => {
      const node = panel.current;
      if (!node) return;
      node.style.setProperty('--chat-viewport-height', `${Math.round(viewport.height)}px`);
      // Страницу могли «подтолкнуть» вверх вместе с полем ввода: без этого
      // сдвига панель уезжает за нижнюю кромку видимой области.
      node.style.setProperty('--chat-viewport-offset', `${Math.round(viewport.offsetTop)}px`);
    };

    apply();
    viewport.addEventListener('resize', apply);
    viewport.addEventListener('scroll', apply);
    return () => {
      viewport.removeEventListener('resize', apply);
      viewport.removeEventListener('scroll', apply);
      const node = panel.current;
      if (node) {
        node.style.removeProperty('--chat-viewport-height');
        node.style.removeProperty('--chat-viewport-offset');
      }
    };
  }, [active, panel]);
}

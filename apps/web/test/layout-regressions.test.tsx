import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { App } from '@/App';
import i18n from '@/i18n';
import type { Locale } from '@/i18n';
import { renderWithProviders } from './render';

beforeEach(() => {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
  window.sessionStorage.clear();
});

afterEach(async () => {
  await i18n.changeLanguage('ru');
});

const LOCALES: Locale[] = ['ru', 'hy', 'en'];

describe('переключатель языка', () => {
  /**
   * В футере переключатель лежит в ячейке сетки. Блочный `flex` растягивался
   * на всю её ширину, и справа от EN оставалось до 200 px пустой рамки —
   * в шапке того же не было только потому, что там он элемент flex-строки.
   * `inline-flex w-fit` обтягивает содержимое в обоих местах.
   */
  it('рамка обтягивает содержимое и в шапке, и в футере', async () => {
    renderWithProviders(<App />, { route: '/' });

    const switchers = await waitFor(() => {
      const found = document.querySelectorAll('.language-switcher');
      expect(found.length).toBeGreaterThanOrEqual(2);
      return [...found];
    });

    for (const switcher of switchers) {
      expect(switcher.className).toContain('inline-flex');
      expect(switcher.className).toContain('w-fit');
      expect(switcher.className).not.toMatch(/(^|\s)w-full(\s|$)/);
    }
  });

  it('во всех локалях показывает три языка', async () => {
    for (const locale of LOCALES) {
      await i18n.changeLanguage(locale);
      const view = renderWithProviders(<App />, { route: '/' });

      const footer = document.querySelector('footer .language-switcher');
      expect(footer?.querySelectorAll('button')).toHaveLength(3);
      view.unmount();
    }
  });
});

describe('списки калькулятора', () => {
  /**
   * Подпись в закрытом списке обрезается многоточием, поэтому полное значение
   * должно оставаться доступным подсказкой — особенно на армянском, где
   * «Ամբողջական վերանորոգում» длиннее ширины поля.
   */
  it('у списка есть title с полной подписью выбранного варианта во всех локалях', async () => {
    for (const locale of LOCALES) {
      await i18n.changeLanguage(locale);
      const view = renderWithProviders(<App />, { route: '/' });

      const select = document.querySelector<HTMLSelectElement>('#workScope');
      expect(select).not.toBeNull();
      await waitFor(() => {
        expect(select).toHaveAttribute(
          'title',
          i18n.t('calculator.workScopeOptions.TURNKEY') as string,
        );
      });
      view.unmount();
    }
  });

  it('подсказка следует за выбором', async () => {
    renderWithProviders(<App />, { route: '/' });

    const select = screen.getByLabelText('Объём работ') as HTMLSelectElement;
    await waitFor(() => expect(select).toHaveAttribute('title', 'Под ключ'));
  });
});

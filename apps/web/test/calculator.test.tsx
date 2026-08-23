import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { AMD_SIGN, formatAmd } from '@/lib/format';
import { renderWithProviders } from './render';

/** Testing Library схлопывает узкие неразрывные пробелы — сверяем так же. */
const amount = (value: number): string => formatAmd(value).replace(/\s/g, ' ');

/**
 * Сеть в тестах всегда падает: расчёт обязан работать без неё — цену считает
 * pricing-core в браузере (US-1).
 */
beforeEach(() => {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
  window.sessionStorage.clear();
});

async function calculate(overrides: {
  area: string;
  finishPackage?: 'STANDARD' | 'DESIGNER';
  objectType?: 'APARTMENT' | 'HOUSE';
  workScope?: 'TURNKEY' | 'FINISHING' | 'ROUGH';
  condition?: 'NEW_BUILDING' | 'SECONDARY_WITH_DEMOLITION';
  ceilingHeight?: 'UP_TO_3M' | 'FROM_3M';
}): Promise<void> {
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText(/Площадь/));
  await user.type(screen.getByLabelText(/Площадь/), overrides.area);
  if (overrides.objectType) {
    await user.selectOptions(screen.getByLabelText('Тип объекта'), overrides.objectType);
  }
  if (overrides.workScope) {
    await user.selectOptions(screen.getByLabelText('Объём работ'), overrides.workScope);
  }
  if (overrides.finishPackage) {
    await user.selectOptions(screen.getByLabelText('Пакет отделки'), overrides.finishPackage);
  }
  if (overrides.condition) {
    await user.selectOptions(screen.getByLabelText('Состояние объекта'), overrides.condition);
  }
  if (overrides.ceilingHeight) {
    await user.selectOptions(screen.getByLabelText('Высота потолков'), overrides.ceilingHeight);
  }
  await user.click(screen.getByRole('button', { name: 'Рассчитать' }));
}

describe('быстрый расчёт', () => {
  it('считает вилку по примеру из README: 80 м² под ключ = 4 080 000 — 5 520 000', async () => {
    renderWithProviders(<App />, { route: '/' });
    await calculate({ area: '80' });

    expect(await screen.findByText(amount(4_080_000))).toBeInTheDocument();
    expect(screen.getByText(amount(5_520_000))).toBeInTheDocument();
  });

  it('учитывает коэффициенты: дом, черновая, вторичка, высокие потолки', async () => {
    renderWithProviders(<App />, { route: '/' });
    await calculate({
      area: '100',
      objectType: 'HOUSE',
      workScope: 'ROUGH',
      condition: 'SECONDARY_WITH_DEMOLITION',
      ceilingHeight: 'FROM_3M',
    });

    // 100 × 60000 × 0.45 × 1.15 × 1.15 × 1.1 = 3 927 825
    expect(await screen.findByText(amount(3_338_651))).toBeInTheDocument();
    expect(screen.getByText(amount(4_516_999))).toBeInTheDocument();
  });

  it('показывает срок действия и оговорку о предварительном характере', async () => {
    renderWithProviders(<App />, { route: '/' });
    await calculate({ area: '80' });

    expect(await screen.findByText(/Расчёт действует до/)).toBeInTheDocument();
    expect(
      screen.getAllByText('Предварительная оценка. Точная стоимость — после замера.').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Что входит в стандартный пакет')).toBeInTheDocument();
  });

  it('на площадь вне 10–1000 м² выдаёт ошибку и не считает', async () => {
    renderWithProviders(<App />, { route: '/' });
    await calculate({ area: '5' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Площадь должна быть от 10 до 1000 м²',
    );
    // Расчёт не выполнен: пользователь остался на форме, экрана результата нет.
    expect(screen.queryByText('Вилка стоимости, AMD')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Рассчитать' })).toBeInTheDocument();
  });

  it('дизайнерский пакет не показывает сумму ни при каком вводе', async () => {
    for (const area of ['10', '80', '640', '1000']) {
      const view = renderWithProviders(<App />, { route: '/' });
      await calculate({ area, finishPackage: 'DESIGNER' });

      expect(await screen.findByText('Проект требует индивидуального расчёта')).toBeInTheDocument();
      await waitFor(() => {
        // Ни одной суммы: знак драма на экране результата не встречается вовсе.
        expect(document.body.textContent).not.toContain(AMD_SIGN);
      });
      expect(screen.getByRole('link', { name: 'Отправить заявку сметчику' })).toBeInTheDocument();
      view.unmount();
      window.sessionStorage.clear();
    }
  });
});

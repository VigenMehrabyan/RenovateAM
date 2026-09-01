import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { App } from '@/App';
import { makeUser, renderWithProviders } from './render';

const RATES = {
  versionId: 'v1',
  baseRateAmd: 60_000,
  workScope: { TURNKEY: 1, FINISHING: 0.7, ROUGH: 0.45 },
  objectType: { APARTMENT: 1, HOUSE: 1.15 },
  condition: { NEW_BUILDING: 1, SECONDARY_WITH_DEMOLITION: 1.18 },
  ceilingHeight: { UP_TO_3M: 1, FROM_3M: 1.12 },
  rangeMin: 0.9,
  rangeMax: 1.15,
  validityDays: 30,
};

beforeEach(() => {
  globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const body = String(input).includes('/pricing/rates') ? RATES : [];
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify(body),
      json: async () => body,
    });
  }) as unknown as typeof fetch;
  window.sessionStorage.clear();
});

describe('подписи полей', () => {
  /**
   * Поле выбора файлов спрятано визуально (`sr-only`), но остаётся в дереве
   * доступности. Без имени программа чтения объявляла оба поля одинаково —
   * пользователь не знал, куда попадёт файл: в план БТИ или в дизайн.
   */
  it('у обоих полей загрузки есть имя, различающее раздел', async () => {
    renderWithProviders(<App />, { route: '/requests/new', user: makeUser() });

    const bti = await screen.findByLabelText('План БТИ', { selector: 'input' });
    const design = screen.getByLabelText('Желаемый дизайн', { selector: 'input' });
    expect(bti).toHaveAttribute('type', 'file');
    expect(design).toHaveAttribute('type', 'file');
  });

  it('каждое поле калькулятора связано с подписью', async () => {
    renderWithProviders(<App />, { route: '/' });

    for (const label of [
      /Площадь/,
      'Тип объекта',
      'Объём работ',
      'Пакет отделки',
      'Состояние объекта',
      'Высота потолков',
    ]) {
      expect(await screen.findByLabelText(label)).toBeInTheDocument();
    }
  });
});

describe('логотип в шапке', () => {
  /**
   * Пропорции знака менять нельзя (brand/README.md). Во flex-строке шапки
   * ссылка с логотипом сжималась, а высота оставалась прежней: на 768 px
   * надпись плющило с 223 до 92 px. `shrink-0` это запрещает, атрибуты
   * `width`/`height` задают исходное соотношение сторон.
   */
  it('ссылка с логотипом не сжимается, у изображения заданы пропорции', async () => {
    renderWithProviders(<App />, { route: '/' });

    const images = await screen.findAllByAltText('RenovateAM');
    const header = images[0]?.closest('a');
    expect(header?.className).toContain('shrink-0');

    for (const image of images) {
      expect(image).toHaveAttribute('width');
      expect(image).toHaveAttribute('height');
    }
  });
});

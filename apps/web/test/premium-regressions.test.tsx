import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { pricingApi, requestsApi } from '@/lib/api';
import {
  attachEstimateId,
  clearEstimate,
  readEstimate,
  saveEstimate,
} from '@/lib/estimate-storage';
import type { CalculatorValues } from '@/lib/validation';
import type { RequestResponse } from '@/lib/api-types';
import { makeUser, renderWithProviders } from './render';

const input: CalculatorValues = {
  areaSqm: 125,
  objectType: 'HOUSE',
  workScope: 'ROUGH',
  finishPackage: 'STANDARD',
  condition: 'SECONDARY_WITH_DEMOLITION',
  ceilingHeight: 'FROM_3M',
};
const stored = { input, calculatedAt: '2026-09-07T10:00:00.000Z', token: 'current' };
const ADDRESS = 'Ереван, Маштоца 10';

beforeEach(() => {
  clearEstimate();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
});

describe('estimate and request regressions', () => {
  it('restores all six inputs when returning to the calculator', () => {
    saveEstimate(stored);
    renderWithProviders(<App />);
    expect(screen.getByLabelText(/Площадь/)).toHaveValue(125);
    expect(screen.getByLabelText('Тип объекта')).toHaveValue('HOUSE');
    expect(screen.getByLabelText('Объём работ')).toHaveValue('ROUGH');
    expect(screen.getByLabelText('Пакет отделки')).toHaveValue('STANDARD');
    expect(screen.getByLabelText('Состояние объекта')).toHaveValue('SECONDARY_WITH_DEMOLITION');
    expect(screen.getByLabelText('Высота потолков')).toHaveValue('FROM_3M');
  });

  it('designer CTA overrides the old standard package without losing area', async () => {
    saveEstimate(stored);
    renderWithProviders(<App />, { route: '/?finishPackage=DESIGNER#calculator' });
    expect(await screen.findByLabelText('Пакет отделки')).toHaveValue('DESIGNER');
    expect(screen.getByLabelText(/Площадь/)).toHaveValue(125);
  });

  it('reapplies the designer CTA after a manual change on the same URL', async () => {
    saveEstimate(stored);
    renderWithProviders(<App />, { route: '/?finishPackage=DESIGNER#calculator' });
    const packageSelect = screen.getByLabelText('Пакет отделки');
    await userEvent.selectOptions(packageSelect, 'STANDARD');
    const link = document.querySelector('a[href="/?finishPackage=DESIGNER#calculator"]');
    expect(link).not.toBeNull();
    await userEvent.click(link as HTMLAnchorElement);
    expect(packageSelect).toHaveValue('DESIGNER');
    expect(screen.getByLabelText('Объём работ')).toHaveValue('ROUGH');
    expect(screen.getByLabelText(/Площадь/)).toHaveValue(125);
  });

  it('shows designer review immediately even when rates never respond', async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => undefined));
    saveEstimate({ ...stored, input: { ...input, finishPackage: 'DESIGNER' } });
    renderWithProviders(<App />, { route: '/estimate' });
    expect(await screen.findByText('Проект требует индивидуального расчёта')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('֏');
  });

  it('rough work does not promise the full turnkey package', async () => {
    saveEstimate(stored);
    renderWithProviders(<App />, { route: '/estimate' });
    expect(
      await screen.findByText(/Стяжка, штукатурка/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Черновые и чистовые работы под ключ/)).not.toBeInTheDocument();
  });

  it('keeps a working estimate when storage writes are denied', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    saveEstimate(stored);
    expect(readEstimate()?.input.areaSqm).toBe(125);
    attachEstimateId('current', 'saved-id');
    expect(readEstimate()?.estimateId).toBe('saved-id');
    clearEstimate();
    expect(readEstimate()).toBeNull();
  });

  it.each([
    { input, calculatedAt: 'not-a-date' },
    { input: { ...input, objectType: 'INVALID' }, calculatedAt: stored.calculatedAt },
  ])('rejects invalid stored data without rendering NaN or crashing', (value) => {
    sessionStorage.setItem('renovateam.estimate', JSON.stringify(value));
    expect(readEstimate()).toBeNull();
  });

  it('reads an estimate ID that arrived after the request page mounted', async () => {
    saveEstimate(stored);
    const create = vi
      .spyOn(requestsApi, 'create')
      .mockResolvedValue({ id: 'request-id' } as RequestResponse);
    const estimate = vi.spyOn(pricingApi, 'estimate');
    renderWithProviders(<App />, { route: '/requests/new', user: makeUser() });
    attachEstimateId('current', 'late-id');
    await userEvent.type(screen.getByLabelText('Адрес объекта'), ADDRESS);
    await userEvent.click(screen.getByRole('button', { name: 'Отправить заявку' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ address: ADDRESS, quickEstimateId: 'late-id' }),
    );
    expect(estimate).not.toHaveBeenCalled();
  });

  it('persists missing estimate inputs before sending the request', async () => {
    saveEstimate(stored);
    const create = vi
      .spyOn(requestsApi, 'create')
      .mockResolvedValue({ id: 'request-id' } as RequestResponse);
    const estimate = vi.spyOn(pricingApi, 'estimate').mockResolvedValue({
      id: 'retry-id',
      needsManualReview: true,
      rateVersionId: 'v1',
      reason: 'DESIGNER_PACKAGE',
      expiresAt: '2026-10-07T10:00:00Z',
    });
    renderWithProviders(<App />, { route: '/requests/new', user: makeUser() });
    await userEvent.type(screen.getByLabelText('Адрес объекта'), ADDRESS);
    await userEvent.click(screen.getByRole('button', { name: 'Отправить заявку' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ address: ADDRESS, quickEstimateId: 'retry-id' }),
    );
    expect(estimate).toHaveBeenCalledWith({ ...input, locale: 'RU' });
  });

  it('keeps the request unsent if saving its estimate fails', async () => {
    saveEstimate(stored);
    const create = vi.spyOn(requestsApi, 'create');
    vi.spyOn(pricingApi, 'estimate').mockRejectedValue(new Error('offline'));
    renderWithProviders(<App />, { route: '/requests/new', user: makeUser() });
    await userEvent.type(screen.getByLabelText('Адрес объекта'), ADDRESS);
    await userEvent.click(screen.getByRole('button', { name: 'Отправить заявку' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    expect(readEstimate()?.input).toEqual(input);
  });

  /**
   * Адрес объекта больше не берётся из профиля молча: заявок у клиента может
   * быть несколько, и отправка «не туда» стоила бы выезда сметчика.
   */
  it('does not send a request without a property address', async () => {
    saveEstimate(stored);
    const create = vi.spyOn(requestsApi, 'create');
    renderWithProviders(<App />, { route: '/requests/new', user: makeUser() });

    await userEvent.click(screen.getByRole('button', { name: 'Отправить заявку' }));

    expect(await screen.findByText('Укажите адрес объекта')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
});

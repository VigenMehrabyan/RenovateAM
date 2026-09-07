import { describe, expect, it, vi } from 'vitest';
import { PricingService } from './pricing.service';
import type { PricingRepository } from './pricing.repository';

function setup(owner: string | null = 'owner') {
  const repository = {
    findQuickEstimate: vi.fn().mockResolvedValue({
      id: 'estimate',
      userId: owner,
      needsManual: true,
      rateVersionId: 'v1',
      areaSqm: 80,
      objectType: 'APARTMENT',
      workScope: 'TURNKEY',
      finishPackage: 'DESIGNER',
      condition: 'NEW_BUILDING',
      ceilingHeight: 'UP_TO_3M',
      amountMin: null,
      amountMax: null,
      amountBase: null,
      expiresAt: new Date('2026-10-07'),
      createdAt: new Date('2026-09-07'),
    }),
    createVersion: vi.fn().mockResolvedValue({ id: 'v2', createdAt: new Date() }),
  };
  return { repository, service: new PricingService(repository as unknown as PricingRepository) };
}

describe('pricing safeguards', () => {
  it('rejects another registered customer’s estimate', async () => {
    const { service } = setup();
    await expect(service.getQuickEstimate('estimate', 'other-user')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
  it('allows the owner and internal reads', async () => {
    const { service } = setup();
    expect(await service.getQuickEstimate('estimate', 'owner')).toMatchObject({ id: 'estimate' });
    expect(await service.getQuickEstimate('estimate')).toMatchObject({ id: 'estimate' });
  });
  it('preserves the guest-estimate conversion flow', async () => {
    const { service } = setup(null);
    expect(await service.getQuickEstimate('estimate', 'new-user')).toMatchObject({
      id: 'estimate',
    });
  });
  it('rejects inverted price bounds before writing a version', async () => {
    const { service, repository } = setup();
    await expect(
      service.createRateVersion({ range_min: 1.5, range_max: 1.1 }, 'admin'),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(repository.createVersion).not.toHaveBeenCalled();
  });
  it('validates partial bounds against the effective defaults', async () => {
    const { service } = setup();
    await expect(service.createRateVersion({ range_min: 2 }, 'admin')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});

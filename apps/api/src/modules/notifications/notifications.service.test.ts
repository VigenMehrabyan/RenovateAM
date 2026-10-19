import { describe, expect, it, vi } from 'vitest';
import type { NotificationChannel } from './channels/notification-channel';
import { NotificationsService } from './notifications.service';
import type { NotificationEvent } from './public';

const EVENT: NotificationEvent = {
  type: 'EMAIL_VERIFICATION',
  to: 'client@example.com',
  locale: 'RU',
  link: 'https://renovateam.am/verify?token=abc',
};

function channel(name: string, behaviour: 'ok' | 'throws'): NotificationChannel {
  return {
    name,
    supports: () => true,
    send: vi.fn(() =>
      behaviour === 'ok' ? Promise.resolve() : Promise.reject(new Error('провайдер отказал')),
    ),
  };
}

/**
 * Диспетчер обязан сообщать исход доставки: раньше он молча проглатывал
 * ошибку канала, и вызывающий не мог отличить отправленное письмо от
 * неотправленного.
 */
describe('NotificationsService', () => {
  it('канал принял письмо → accepted: true', async () => {
    const service = new NotificationsService([channel('ok', 'ok')]);
    await expect(service.send(EVENT)).resolves.toEqual({ accepted: true });
  });

  it('канал отказал → accepted: false, исключение наружу не выходит', async () => {
    const service = new NotificationsService([channel('broken', 'throws')]);
    await expect(service.send(EVENT)).resolves.toEqual({ accepted: false });
  });

  it('хватает одного сработавшего канала из двух', async () => {
    const service = new NotificationsService([channel('broken', 'throws'), channel('ok', 'ok')]);
    await expect(service.send(EVENT)).resolves.toEqual({ accepted: true });
  });

  it('событие, которое не берёт ни один канал, не считается доставленным', async () => {
    const service = new NotificationsService([
      { name: 'silent', supports: () => false, send: vi.fn(() => Promise.resolve()) },
    ]);
    await expect(service.send(EVENT)).resolves.toEqual({ accepted: false });
  });
});

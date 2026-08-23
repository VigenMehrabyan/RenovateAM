import type { NotificationEvent } from '../public';

/** DI-токен списка активных каналов доставки. */
export const NOTIFICATION_CHANNELS = 'NOTIFICATION_CHANNELS';

/**
 * Канал доставки. Второй канал (WhatsApp) добавляется реализацией этого
 * интерфейса и регистрацией в провайдере — без изменений в вызывающем коде.
 */
export interface NotificationChannel {
  readonly name: string;
  /** Умеет ли канал доставить это событие. */
  supports(event: NotificationEvent): boolean;
  send(event: NotificationEvent): Promise<void>;
}

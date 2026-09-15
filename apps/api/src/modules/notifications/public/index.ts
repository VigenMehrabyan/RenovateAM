import type { DecisionResult, Locale } from '@db/enums';

/** DI-токен публичного сервиса уведомлений. */
export const NOTIFICATIONS_PUBLIC_SERVICE = 'NOTIFICATIONS_PUBLIC_SERVICE';

/**
 * Событие для отправки. Канал доставки (e-mail, в будущем WhatsApp)
 * выбирается внутри модуля: вызывающий описывает ЧТО произошло,
 * а не КАК это доставить.
 */
export type NotificationEvent =
  | { type: 'EMAIL_VERIFICATION'; to: string; locale: Locale; link: string }
  | { type: 'REQUEST_SUBMITTED'; to: string; locale: Locale; requestNumber: number }
  | {
      type: 'REQUEST_NEEDS_INFO';
      to: string;
      locale: Locale;
      requestNumber: number;
      comment: string;
    }
  | { type: 'QUOTE_READY'; to: string; locale: Locale; requestNumber: number }
  /**
   * Новое сообщение в обсуждении заявки. Письмо уходит на КАЖДОЕ сообщение —
   * так решил заказчик; исключение одно: автору его собственного сообщения
   * письма нет. `byStaff` выбирает адресата и формулировку: написал
   * сотрудник — пишем клиенту, написал клиент — пишем на общий ящик.
   */
  | {
      type: 'REQUEST_COMMENT';
      to: string;
      locale: Locale;
      requestNumber: number;
      byStaff: boolean;
      comment: string;
    }
  | {
      type: 'DECISION_MADE';
      to: string;
      locale: Locale;
      requestNumber: number;
      result: DecisionResult;
    };

export type NotificationEventType = NotificationEvent['type'];

export interface NotificationsPublicService {
  /**
   * Fire-and-forget: ошибка доставки логируется, но не роняет бизнес-операцию.
   * Вызывать только ПОСЛЕ коммита транзакции.
   */
  send(event: NotificationEvent): Promise<void>;
}

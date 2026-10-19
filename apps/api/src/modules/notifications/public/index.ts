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

/**
 * Итог отправки. Наружу уходит только факт: приняли сообщение или нет.
 * Какой канал сработал, что именно ответил провайдер и почему отказал —
 * внутреннее дело модуля, в публичный тип это не попадает.
 */
export interface NotificationDelivery {
  /**
   * `true` — хотя бы один канал принял сообщение к доставке.
   * `false` — не ушло никуда: вызывающий обязан сказать об этом
   * пользователю, а не отвечать «письмо отправлено».
   */
  accepted: boolean;
}

export interface NotificationsPublicService {
  /**
   * Отправляет событие. Исключение канала наружу не выходит — вместо него
   * возвращается `{ accepted: false }`: доставка не роняет бизнес-операцию,
   * но и не притворяется успешной. Вызывать только ПОСЛЕ коммита транзакции.
   */
  send(event: NotificationEvent): Promise<NotificationDelivery>;
}

/**
 * Машинные коды ошибок API (docs/ARCHITECTURE.md §9).
 * Коды стабильны: фронт по ним выбирает локализованный текст (ru/hy/en).
 */
export const ErrorCode = {
  // 400
  TOKEN_INVALID: 'TOKEN_INVALID',
  MALFORMED_REQUEST: 'MALFORMED_REQUEST',
  // 401
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCESS_TOKEN_EXPIRED: 'ACCESS_TOKEN_EXPIRED',
  REFRESH_INVALID: 'REFRESH_INVALID',
  // 403
  FORBIDDEN: 'FORBIDDEN',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  /**
   * Разговор в чате продолжается только с контактами: приветствие и первый
   * вопрос бесплатны (docs/CHAT.md §5.1). Отдельный код от FORBIDDEN:
   * виджету надо не «нельзя», а «покажи форму контактов».
   */
  CHAT_CONTACTS_REQUIRED: 'CHAT_CONTACTS_REQUIRED',
  // 404
  NOT_FOUND: 'NOT_FOUND',
  /**
   * Разговора нет или он старше суток. Один код на оба случая намеренно:
   * виджет в обоих молча начинает новую сессию, и различать ему нечего.
   */
  CHAT_SESSION_NOT_FOUND: 'CHAT_SESSION_NOT_FOUND',
  // 409
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  DECISION_ALREADY_MADE: 'DECISION_ALREADY_MADE',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  /**
   * Переход в QUOTE_READY сам по себе разрешён, но смета ещё не загружена.
   * Отдельный код от INVALID_STATUS_TRANSITION: это не запрет, а невыполненное
   * условие — сметчику надо сказать, что сделать, а не что нельзя.
   */
  QUOTE_REQUIRED: 'QUOTE_REQUIRED',
  TOKEN_ALREADY_USED: 'TOKEN_ALREADY_USED',
  FILE_LIMIT_REACHED: 'FILE_LIMIT_REACHED',
  UPLOAD_NOT_FOUND: 'UPLOAD_NOT_FOUND',
  ALREADY_VERIFIED: 'ALREADY_VERIFIED',
  /** Заявка отклонена: лента обсуждения остаётся, но только для чтения. */
  DISCUSSION_CLOSED: 'DISCUSSION_CLOSED',
  // 410
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  ESTIMATE_EXPIRED: 'ESTIMATE_EXPIRED',
  // 413 / 415
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  // 422
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  AREA_OUT_OF_RANGE: 'AREA_OUT_OF_RANGE',
  COMMENT_REQUIRED: 'COMMENT_REQUIRED',
  // 429
  RATE_LIMITED: 'RATE_LIMITED',
  RESEND_TOO_SOON: 'RESEND_TOO_SOON',
  /** Антидубль заявок: больше трёх штук в час от одного клиента. */
  REQUEST_LIMIT_REACHED: 'REQUEST_LIMIT_REACHED',
  /**
   * Предел сообщений посетителя на один разговор в чате (60, §5.1).
   * Отдельный код от RATE_LIMITED: это не «слишком часто», а «хватит
   * на эту сессию» — виджету стоит предложить живого человека.
   */
  CHAT_SESSION_EXHAUSTED: 'CHAT_SESSION_EXHAUSTED',
  // 500
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  // 502
  /** Почтовый канал отказался принять письмо: отправка не удалась. */
  EMAIL_DELIVERY_FAILED: 'EMAIL_DELIVERY_FAILED',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Тело ответа об ошибке — единое для всех 4xx/5xx. */
export interface ApiErrorBody {
  error: {
    code: ErrorCodeValue | string;
    message: string;
    details?: Array<{ field: string; code: string }>;
    requestId: string;
  };
}

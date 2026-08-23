import { RequestStatus, UserRole } from '@db/enums';

/**
 * Статусная машина заявки (docs/ARCHITECTURE.md §8).
 *
 * Чистый модуль без зависимостей: матрица переходов и правило актора
 * проверяются юнит-тестами без БД и без DI.
 */
export const TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  [RequestStatus.NEW]: [RequestStatus.IN_PROGRESS, RequestStatus.NEEDS_INFO],
  [RequestStatus.IN_PROGRESS]: [RequestStatus.NEEDS_INFO, RequestStatus.QUOTE_READY],
  [RequestStatus.NEEDS_INFO]: [RequestStatus.IN_PROGRESS, RequestStatus.QUOTE_READY],
  [RequestStatus.QUOTE_READY]: [
    RequestStatus.ACCEPTED,
    RequestStatus.REJECTED,
    RequestStatus.NEEDS_INFO,
  ],
  [RequestStatus.ACCEPTED]: [],
  [RequestStatus.REJECTED]: [],
};

/** Статусы, в которых заявка считается активной (инвариант «одна активная»). */
export const ACTIVE_STATUSES: readonly RequestStatus[] = [
  RequestStatus.NEW,
  RequestStatus.IN_PROGRESS,
  RequestStatus.NEEDS_INFO,
  RequestStatus.QUOTE_READY,
];

/** Терминальные статусы: решение необратимо. */
export const TERMINAL_STATUSES: readonly RequestStatus[] = [
  RequestStatus.ACCEPTED,
  RequestStatus.REJECTED,
];

/** Переходы, которые делает ТОЛЬКО клиент-владелец: это его решение. */
export const CLIENT_ONLY_TRANSITIONS: readonly RequestStatus[] = [
  RequestStatus.ACCEPTED,
  RequestStatus.REJECTED,
];

export type TransitionActor = 'CLIENT_OWNER' | 'STAFF';

export type TransitionCheck =
  | { allowed: true }
  | { allowed: false; reason: 'INVALID_TRANSITION' | 'WRONG_ACTOR' | 'COMMENT_REQUIRED' };

/** Допустим ли переход по матрице (без учёта актора). */
export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Роль сотрудника (сметчик или админ). */
export function isStaffRole(role: UserRole): boolean {
  return role === UserRole.ESTIMATOR || role === UserRole.ADMIN;
}

/**
 * Полная проверка перехода: матрица, актор и обязательность комментария.
 *
 * - ACCEPTED / REJECTED делает только клиент-владелец;
 * - все остальные переходы — только сотрудник;
 * - переход в NEEDS_INFO требует комментария (он уходит клиенту письмом).
 */
export function checkTransition(params: {
  from: RequestStatus;
  to: RequestStatus;
  actor: TransitionActor;
  comment?: string | null;
}): TransitionCheck {
  if (!canTransition(params.from, params.to)) {
    return { allowed: false, reason: 'INVALID_TRANSITION' };
  }

  const clientOnly = CLIENT_ONLY_TRANSITIONS.includes(params.to);
  if (clientOnly && params.actor !== 'CLIENT_OWNER') {
    return { allowed: false, reason: 'WRONG_ACTOR' };
  }
  if (!clientOnly && params.actor !== 'STAFF') {
    return { allowed: false, reason: 'WRONG_ACTOR' };
  }

  if (params.to === RequestStatus.NEEDS_INFO && !params.comment?.trim()) {
    return { allowed: false, reason: 'COMMENT_REQUIRED' };
  }

  return { allowed: true };
}

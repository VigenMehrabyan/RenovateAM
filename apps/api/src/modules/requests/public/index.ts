import type { DecisionResult, RejectionReason, RequestStatus, UserRole } from '@db/enums';
import type { FileMeta } from '@modules/files/public';
import type { QuickEstimateView } from '@modules/pricing/public';

/** DI-токен публичного сервиса модуля requests. */
export const REQUESTS_PUBLIC_SERVICE = 'REQUESTS_PUBLIC_SERVICE';

export interface RequestQuoteView {
  id: string;
  totalAmount: number;
  createdAt: string;
}

export interface RequestDecisionView {
  result: DecisionResult;
  reason: RejectionReason | null;
  comment: string | null;
  createdAt: string;
}

export interface RequestView {
  id: string;
  number: number;
  userId: string;
  status: RequestStatus;
  needsManual: boolean;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  estimate: QuickEstimateView | null;
  files: FileMeta[];
  decision: RequestDecisionView | null;
}

export interface StatusLogView {
  id: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  actorId: string | null;
  comment: string | null;
  createdAt: string;
}

/** Команда смены статуса — единственная точка перехода в системе. */
export interface TransitionCommand {
  requestId: string;
  to: RequestStatus;
  actor: { id: string; role: UserRole };
  comment?: string;
  /**
   * Есть ли у заявки актуальная смета. Передаёт владелец таблицы quotes
   * (модуль admin): requests проверяет инвариант, но чужую таблицу не читает.
   */
  hasCurrentQuote?: boolean;
}

export interface RequestsPublicService {
  getById(requestId: string): Promise<RequestView | null>;
  /** Гейт «одна активная заявка на клиента» (US-4). */
  hasActiveRequest(userId: string): Promise<boolean>;
  /** Проверка владения заявкой. */
  isOwnedBy(requestId: string, userId: string): Promise<boolean>;
  /** Смена статуса с журналом и уведомлениями. */
  transitionStatus(command: TransitionCommand): Promise<RequestView>;
  /** Очередь сметчика с фильтрами. */
  listForStaff(params: {
    status?: RequestStatus;
    userIds?: string[];
    page: number;
    pageSize: number;
    sortDirection: 'asc' | 'desc';
  }): Promise<{ items: RequestView[]; total: number }>;
  /** Журнал смены статусов заявки. */
  getStatusLog(requestId: string): Promise<StatusLogView[]>;
}

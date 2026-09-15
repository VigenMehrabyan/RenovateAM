import type { DecisionResult, RejectionReason, RequestStatus, UserRole } from '@db/enums';
import type { FileMeta } from '@modules/files/public';
import type { QuickEstimateView } from '@modules/pricing/public';

/** DI-токен публичного сервиса модуля requests. */
export const REQUESTS_PUBLIC_SERVICE = 'REQUESTS_PUBLIC_SERVICE';

/** Смета в том виде, в каком её видит клиент: ключа в хранилище здесь нет. */
export interface RequestQuoteView {
  id: string;
  totalAmount: number;
  createdAt: string;
}

/** Смета вместе с ключом файла — для выдачи подписанной ссылки. */
export interface RequestQuoteWithKey extends RequestQuoteView {
  fileKey: string;
}

/** Откуда в заявке взялся файл. */
export type RequestFileSource =
  /** Приложен к самой заявке при отправке. */
  | 'REQUEST'
  /** Дослан сообщением в обсуждении. */
  | 'DISCUSSION';

/**
 * Файл заявки с пометкой происхождения. Файлы из переписки попадают в общий
 * список файлов заявки: искать вложение по ленте клиент не должен.
 */
export interface RequestFileView extends FileMeta {
  source: RequestFileSource;
}

/**
 * Автор сообщения. Роль — снимок на момент написания, а не текущая роль
 * учётной записи: сотрудник может уволиться или сменить роль, а лента
 * обязана остаться читаемой.
 */
export interface CommentAuthorView {
  /** null, если учётная запись удалена. */
  id: string | null;
  /** null, если учётной записи больше нет: остаётся роль и дата. */
  name: string | null;
  role: UserRole;
}

/** Сообщение обсуждения. Неизменяемо: правок и удалений нет. */
export interface CommentView {
  id: string;
  author: CommentAuthorView;
  text: string;
  createdAt: string;
  /** Вложения сообщения. Они же видны в общем списке файлов заявки. */
  files: FileMeta[];
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
  /** Адрес объекта. Принадлежит заявке: объектов у клиента может быть несколько. */
  address: string;
  needsManual: boolean;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  estimate: QuickEstimateView | null;
  files: RequestFileView[];
  /** Актуальная смета. Клиент видит её у себя, а не только сметчик в админке. */
  quote: RequestQuoteView | null;
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

/** Карточка заявки: всё то же плюс журнал статусов и лента обсуждения. */
export interface RequestDetailView extends RequestView {
  statusLog: StatusLogView[];
  /** Обсуждение по заявке, от старых сообщений к новым. */
  comments: CommentView[];
}

/** Команда смены статуса — единственная точка перехода в системе. */
export interface TransitionCommand {
  requestId: string;
  to: RequestStatus;
  actor: { id: string; role: UserRole };
  comment?: string;
}

export interface RequestsPublicService {
  getById(requestId: string): Promise<RequestView | null>;
  /** Карточка заявки вместе с журналом статусов. */
  getDetailById(requestId: string): Promise<RequestDetailView | null>;
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
  /**
   * Регистрирует загруженную сметчиком смету. Файл в хранилище кладёт admin,
   * строку в таблице заводит владелец агрегата — прежняя смета остаётся
   * в истории с `is_current = false` (MVP §7).
   */
  registerQuote(params: {
    requestId: string;
    authorId: string;
    fileKey: string;
    totalAmount: number;
  }): Promise<RequestQuoteView>;
  /** Актуальная смета заявки вместе с ключом файла. */
  getCurrentQuote(requestId: string): Promise<RequestQuoteWithKey | null>;
}

/**
 * Типы контракта модуля `chat` (docs/CHAT.md §3.1, §4, §5).
 *
 * Общего пакета типов в репозитории нет (как и для остального API —
 * см. `lib/api-types.ts`), поэтому фронт держит собственное объявление,
 * повторяющее таблицы контракта один в один. Бэкенд делается параллельно:
 * эти типы — то, против чего написан виджет, и единственное место, где
 * форму ответа сервера нужно править, если контракт изменится.
 */
import type { ApiLocale } from '@/i18n';

/** Кнопка действия под ответом бота (§3.1). */
export type ChatActionKind = 'ESTIMATE' | 'REQUEST' | 'PORTFOLIO' | 'CALL' | 'HUMAN';

export const CHAT_ACTION_KINDS: readonly ChatActionKind[] = [
  'ESTIMATE',
  'REQUEST',
  'PORTFOLIO',
  'CALL',
  'HUMAN',
];

/** Ответ бота. Одинаков во всех четырёх эндпоинтах диалога (§5.1). */
export interface ChatReply {
  /** Уже на языке сессии: виджет не переводит ответы бота. */
  text: string;
  /** Тема базы знаний или служебный id (`greeting`, `fallback`, …). */
  entryId: string;
  /** Максимум две кнопки. */
  actions: ChatActionKind[];
  /** Готовые реплики-подсказки, максимум три. */
  suggestions: string[];
  /** `true` → виджет показывает форму контактов внутри ленты. */
  needsContacts: boolean;
}

/** `POST /chat/sessions` → `201`. */
export interface ChatSessionCreated {
  sessionId: string;
  locale: ApiLocale;
  reply: ChatReply;
}

/** `POST /chat/sessions/:id/{messages,contacts,handoff}` → `200`. */
export interface ChatReplyResponse {
  reply: ChatReply;
}

export interface ChatContactsPayload {
  name: string;
  email: string;
  phone: string;
}

/* --------------------------------- админка --------------------------------- */

export type ChatRole = 'VISITOR' | 'BOT';

/** Строка списка лидов (§5.2: имя, телефон, почта, время, первый вопрос, флаги). */
export interface AdminChatSessionRow {
  id: string;
  locale: ApiLocale;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  /** Первый вопрос посетителя — по нему менеджер понимает, о чём разговор. */
  firstQuestion: string | null;
  handoffRequested: boolean;
  handled: boolean;
  lastMessageAt: string;
  createdAt: string;
}

/**
 * Конверт списка. Контракт §5.2 фиксирует только параметры запроса
 * (`handled`, `page`, `perPage`) и состав строки, но не форму конверта;
 * здесь взят тот же конверт, что у очереди заявок (`AdminQueueResponse`),
 * с именем страницы из контракта чата — `perPage`. Разойдётся с бэкендом —
 * правится в одном месте, здесь.
 */
export interface AdminChatSessionsResponse {
  items: AdminChatSessionRow[];
  total: number;
  page: number;
  perPage: number;
}

export interface AdminChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  entryId: string | null;
  createdAt: string;
}

/** Разговор целиком (§4 `ChatSession` + `ChatMessage`). */
export interface AdminChatSessionView extends AdminChatSessionRow {
  pageUrl: string | null;
  leadCapturedAt: string | null;
  handoffRequestedAt: string | null;
  handledAt: string | null;
  messages: AdminChatMessage[];
}

/* ------------------------- вид ленты (не контракт) ------------------------- */

/**
 * Сообщение в ленте виджета. Это не запись из §4, а то, что рисует лента:
 * у ответа бота рядом лежат его кнопки и подсказки, а у служебных строк
 * интерфейса (ошибка отправки) роли «бот» нет вовсе.
 */
export interface ChatMessageView {
  /** Локальный id — ключ списка, с id сообщения на сервере не связан. */
  id: string;
  author: 'visitor' | 'bot';
  text: string;
  entryId?: string;
  actions?: ChatActionKind[];
  suggestions?: string[];
}

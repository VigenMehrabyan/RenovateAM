/**
 * Клиент API чата — строго по docs/CHAT.md §5.
 *
 * Бэкенд делается параллельно и на момент написания виджета не существует,
 * поэтому единственный источник формы запросов и ответов — контракт.
 * Отступлений от него здесь нет, а то, что контракт не фиксирует, вынесено
 * в комментарии (см. `AdminChatSessionsResponse` в `types.ts`).
 *
 * Все эндпоинты диалога публичные (`@Public()`), поэтому они идут
 * с `skipRefresh: true`: обновлять access-токен из-за ответа анонимного
 * эндпоинта незачем, а 401 здесь означал бы ошибку конфигурации, а не
 * истёкшую сессию.
 */
import type { ApiLocale } from '@/i18n';
import { apiRequest } from '@/lib/http';
import type {
  AdminChatSessionView,
  AdminChatSessionsResponse,
  ChatContactsPayload,
  ChatReplyResponse,
  ChatSessionCreated,
} from './types';

/** Коды ошибок чата из контракта (§5.1). */
export const CHAT_SESSION_NOT_FOUND = 'CHAT_SESSION_NOT_FOUND';
export const CHAT_CONTACTS_REQUIRED = 'CHAT_CONTACTS_REQUIRED';
export const CHAT_SESSION_EXHAUSTED = 'CHAT_SESSION_EXHAUSTED';

/** Границы `text` из контракта: 1–1000 символов после `trim`. */
export const CHAT_TEXT_MAX_LENGTH = 1000;

export const chatApi = {
  /** `POST /chat/sessions` → `201 { sessionId, locale, reply }`. */
  createSession: (payload: { locale: ApiLocale; pageUrl?: string }) =>
    apiRequest<ChatSessionCreated>('/chat/sessions', {
      method: 'POST',
      body: payload,
      skipRefresh: true,
    }),

  /** `POST /chat/sessions/:id/messages` → `200 { reply }`. */
  sendMessage: (sessionId: string, text: string) =>
    apiRequest<ChatReplyResponse>(`/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: { text },
      skipRefresh: true,
    }),

  /** `POST /chat/sessions/:id/contacts` → `200 { reply }`. */
  saveContacts: (sessionId: string, payload: ChatContactsPayload) =>
    apiRequest<ChatReplyResponse>(`/chat/sessions/${sessionId}/contacts`, {
      method: 'POST',
      body: payload,
      skipRefresh: true,
    }),

  /** `POST /chat/sessions/:id/handoff` → `200 { reply }`. Идемпотентен. */
  handoff: (sessionId: string) =>
    apiRequest<ChatReplyResponse>(`/chat/sessions/${sessionId}/handoff`, {
      method: 'POST',
      skipRefresh: true,
    }),
};

/* --------------------------------- админка --------------------------------- */

export interface AdminChatQuery {
  /** `undefined` — все, `false` — только необработанные. */
  handled?: boolean;
  page?: number;
  perPage?: number;
}

function toQueryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export const adminChatApi = {
  /** `GET /admin/chat/sessions?handled=&page=&perPage=`. */
  sessions: (query: AdminChatQuery) =>
    apiRequest<AdminChatSessionsResponse>(
      `/admin/chat/sessions${toQueryString({
        handled: query.handled === undefined ? undefined : String(query.handled),
        page: query.page,
        perPage: query.perPage,
      })}`,
    ),

  /** `GET /admin/chat/sessions/:id`. */
  session: (id: string) => apiRequest<AdminChatSessionView>(`/admin/chat/sessions/${id}`),

  /** `POST /admin/chat/sessions/:id/handled`. */
  markHandled: (id: string) =>
    apiRequest<AdminChatSessionView>(`/admin/chat/sessions/${id}/handled`, { method: 'POST' }),
};

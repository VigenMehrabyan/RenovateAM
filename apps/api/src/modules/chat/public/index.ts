import type { ChatRole, Locale } from '@db/enums';
// Собственный словарь модуля; относительный путь «../knowledge/types»
// запрещён линтером (кросс-модульные относительные импорты).
import type { ChatActionKind } from '@modules/chat/knowledge/types';

/** DI-токен публичного сервиса модуля chat. */
export const CHAT_PUBLIC_SERVICE = 'CHAT_PUBLIC_SERVICE';

/**
 * Ответ бота. Одинаков на всех четырёх эндпоинтах диалога (docs/CHAT.md §5.1),
 * чтобы виджету не приходилось различать «ответ на вопрос», «приветствие»
 * и «спасибо за контакты» — он рисует одну и ту же структуру.
 */
export interface ChatReply {
  /** Текст уже на языке сессии: переводить на фронте нечего. */
  text: string;
  /** Тема базы знаний или служебный id (`greeting`, `fallback`, `clarify`, …). */
  entryId: string;
  /** Кнопки под ответом, максимум две. */
  actions: ChatActionKind[];
  /** Готовые реплики-подсказки, максимум три. */
  suggestions: string[];
  /** `true` → виджет показывает форму контактов. */
  needsContacts: boolean;
}

/** Ответ на создание сессии. */
export interface ChatSessionStarted {
  sessionId: string;
  locale: Locale;
  reply: ChatReply;
}

/** Строка списка лидов в админке. */
export interface ChatLeadRow {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  locale: Locale;
  /** Первый вопрос посетителя: по нему менеджер понимает, о чём разговор. */
  firstQuestion: string | null;
  /** Посетитель просил живого человека. */
  handoffRequested: boolean;
  handled: boolean;
  lastMessageAt: string;
  createdAt: string;
}

/** Страница списка лидов. */
export interface ChatLeadList {
  items: ChatLeadRow[];
  page: number;
  perPage: number;
  total: number;
}

/** Одно сообщение разговора в том виде, в котором его видит менеджер. */
export interface ChatMessageView {
  id: string;
  role: ChatRole;
  text: string;
  entryId: string | null;
  createdAt: string;
}

/** Разговор целиком. */
export interface ChatConversation extends ChatLeadRow {
  pageUrl: string | null;
  messages: ChatMessageView[];
}

/** Кто смотрит разговор в админке — для отметки «обработан». */
export interface ChatStaffActor {
  id: string;
}

/**
 * Публичный контракт модуля chat.
 *
 * Своих потребителей внутри API у модуля пока нет: и диалог, и админские
 * списки лидов обслуживают его собственные контроллеры. Интерфейс объявлен
 * всё равно — это единственный разрешённый вход, когда потребитель появится
 * (например, карточка клиента в админке захочет показать его разговоры).
 */
export interface ChatPublicService {
  startSession(input: {
    locale: Locale;
    pageUrl?: string;
    userId?: string;
  }): Promise<ChatSessionStarted>;
  handleMessage(sessionId: string, text: string): Promise<ChatReply>;
  saveContacts(
    sessionId: string,
    contacts: { name: string; email: string; phone: string },
  ): Promise<ChatReply>;
  requestHandoff(sessionId: string): Promise<ChatReply>;
  listLeads(query: { handled?: boolean; page: number; perPage: number }): Promise<ChatLeadList>;
  getConversation(sessionId: string): Promise<ChatConversation>;
  markHandled(sessionId: string, actor: ChatStaffActor): Promise<ChatLeadRow>;
}

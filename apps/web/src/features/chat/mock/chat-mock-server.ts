/**
 * Мок-слой API чата.
 *
 * Бэкенд делается параллельно и к моменту вёрстки виджета не существует.
 * Чтобы в компонентах не было ни одной заглушки, подмена живёт на границе
 * сети: мок — это `fetch`, который отвечает ровно теми кодами и телами,
 * что описаны в docs/CHAT.md §5. Виджет работает против настоящего клиента
 * `chatApi` и не знает, что на другом конце мок.
 *
 * Отсюда же берутся тесты виджета: ставим мок, щёлкаем интерфейс.
 * Логика поиска по базе знаний здесь нарочно примитивная — она не
 * проверяется (её тесты принадлежат бэкенду, §8), важны коды, конверты
 * и переходы состояний.
 */
import { normalizeArmenianPhone } from '../contacts';
import type { ApiLocale } from '@/i18n';
import { API_URL } from '@/lib/http';
import type {
  AdminChatMessage,
  AdminChatSessionRow,
  AdminChatSessionView,
  ChatActionKind,
  ChatReply,
} from '../types';
import { MOCK_ENTRIES, MOCK_SERVICE } from './entries';
import type { MockLocale } from './entries';

/** Лимиты из контракта §5.1. */
const MAX_VISITOR_MESSAGES = 60;
const MAX_TEXT_LENGTH = 1000;

interface MockMessage extends AdminChatMessage {
  sessionId: string;
}

interface MockSession {
  id: string;
  locale: MockLocale;
  pageUrl: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  leadCapturedAt: string | null;
  handoffRequestedAt: string | null;
  handledAt: string | null;
  createdAt: string;
  lastMessageAt: string;
  visitorMessages: number;
}

export interface MockCall {
  method: string;
  path: string;
  body: unknown;
}

export interface ChatMockServer {
  /** Совместим с `fetch`: ставится вместо него целиком или как ветка. */
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** Обслуженные запросы — для проверок в тестах. */
  calls: MockCall[];
  /** Сессии, как их увидела бы админка. */
  rows: () => AdminChatSessionRow[];
  reset: () => void;
}

function toMockLocale(locale: ApiLocale | string | undefined): MockLocale {
  const lower = String(locale ?? 'ru').toLowerCase();
  return lower === 'hy' || lower === 'en' ? lower : 'ru';
}

/** Упрощённое определение языка сообщения (§2, правила 1–2). */
function detectLocale(text: string, fallback: MockLocale): MockLocale {
  if (/[Ѐ-ӿ]/.test(text)) return 'ru';
  if (/[԰-֏]/.test(text)) return 'hy';
  return fallback;
}

function jsonResponse(status: number, body: unknown): Response {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(JSON.parse(text) as unknown),
  } as unknown as Response;
}

function errorResponse(
  status: number,
  code: string,
  details?: { field: string; code: string }[],
): Response {
  return jsonResponse(status, {
    error: { code, message: code, ...(details ? { details } : {}), requestId: 'mock' },
  });
}

function reply(
  text: string,
  entryId: string,
  options: {
    actions?: ChatActionKind[];
    suggestions?: string[];
    needsContacts?: boolean;
  } = {},
): ChatReply {
  return {
    text,
    entryId,
    actions: options.actions ?? [],
    suggestions: options.suggestions ?? [],
    needsContacts: options.needsContacts ?? false,
  };
}

function service(id: keyof typeof MOCK_SERVICE | string, locale: MockLocale): string {
  return MOCK_SERVICE[id]?.[locale] ?? '';
}

/** Поиск темы: совпадение по подстроке, лучшая по числу совпавших ключей. */
function findEntry(text: string): (typeof MOCK_ENTRIES)[number] | null {
  const normalized = text.toLowerCase().replace(/ё/g, 'е');
  let best: { entry: (typeof MOCK_ENTRIES)[number]; score: number } | null = null;
  for (const entry of MOCK_ENTRIES) {
    const score = entry.keywords.filter((keyword) => normalized.includes(keyword)).length;
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  return best?.entry ?? null;
}

export function createChatMockServer(options: { passthrough?: typeof fetch } = {}): ChatMockServer {
  const sessions = new Map<string, MockSession>();
  const messages: MockMessage[] = [];
  const calls: MockCall[] = [];
  let counter = 0;
  const nextId = (prefix: string): string => `${prefix}-${++counter}`;

  const record = (
    session: MockSession,
    role: 'VISITOR' | 'BOT',
    text: string,
    entryId: string | null,
  ): void => {
    const at = new Date(Date.parse(session.createdAt) + messages.length * 1000).toISOString();
    messages.push({
      id: nextId('m'),
      sessionId: session.id,
      role,
      text,
      entryId,
      createdAt: at,
    });
    session.lastMessageAt = at;
  };

  const answer = (session: MockSession, text: string): ChatReply => {
    const entry = findEntry(text);
    if (!entry) {
      const result = reply(service('fallback', session.locale), 'fallback', {
        actions: ['HUMAN'],
      });
      record(session, 'BOT', result.text, result.entryId);
      return result;
    }
    const result = reply(entry.text[session.locale], entry.id, {
      ...(entry.actions ? { actions: entry.actions } : {}),
      ...(entry.suggestions ? { suggestions: entry.suggestions[session.locale] } : {}),
    });
    record(session, 'BOT', result.text, result.entryId);
    return result;
  };

  const toRow = (session: MockSession): AdminChatSessionRow => ({
    id: session.id,
    locale: session.locale.toUpperCase() as ApiLocale,
    contactName: session.contactName,
    contactEmail: session.contactEmail,
    contactPhone: session.contactPhone,
    firstQuestion:
      messages.find((item) => item.sessionId === session.id && item.role === 'VISITOR')?.text ??
      null,
    handoffRequested: session.handoffRequestedAt !== null,
    handled: session.handledAt !== null,
    lastMessageAt: session.lastMessageAt,
    createdAt: session.createdAt,
  });

  const toView = (session: MockSession): AdminChatSessionView => ({
    ...toRow(session),
    pageUrl: session.pageUrl,
    leadCapturedAt: session.leadCapturedAt,
    handoffRequestedAt: session.handoffRequestedAt,
    handledAt: session.handledAt,
    messages: messages
      .filter((item) => item.sessionId === session.id)
      .map(({ sessionId: _sessionId, ...rest }) => rest),
  });

  /** В список лидов попадают только сессии с контактами или с запросом человека (§5.2). */
  const leadRows = (): AdminChatSessionRow[] =>
    [...sessions.values()]
      .filter((session) => session.leadCapturedAt !== null || session.handoffRequestedAt !== null)
      .sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt))
      .map(toRow);

  const handle = async (path: string, method: string, body: unknown): Promise<Response | null> => {
    /* ------------------------------- диалог ------------------------------- */

    if (path === '/chat/sessions' && method === 'POST') {
      const payload = (body ?? {}) as { locale?: ApiLocale; pageUrl?: string };
      const locale = toMockLocale(payload.locale);
      const createdAt = new Date().toISOString();
      const session: MockSession = {
        id: nextId('s'),
        locale,
        pageUrl: payload.pageUrl ?? null,
        contactName: null,
        contactEmail: null,
        contactPhone: null,
        leadCapturedAt: null,
        handoffRequestedAt: null,
        handledAt: null,
        createdAt,
        lastMessageAt: createdAt,
        visitorMessages: 0,
      };
      sessions.set(session.id, session);
      const greeting = reply(service('greeting', locale), 'greeting');
      record(session, 'BOT', greeting.text, greeting.entryId);
      return jsonResponse(201, {
        sessionId: session.id,
        locale: locale.toUpperCase() as ApiLocale,
        reply: greeting,
      });
    }

    const dialog = /^\/chat\/sessions\/([^/]+)\/(messages|contacts|handoff)$/.exec(path);
    if (dialog && method === 'POST') {
      const [, id = '', action] = dialog;
      const session = sessions.get(id);
      if (!session) return errorResponse(404, 'CHAT_SESSION_NOT_FOUND');

      if (action === 'messages') {
        const text = String((body as { text?: unknown } | null)?.text ?? '').trim();
        if (!text || text.length > MAX_TEXT_LENGTH) {
          return errorResponse(400, 'VALIDATION_FAILED', [{ field: 'text', code: 'INVALID' }]);
        }
        if (session.visitorMessages >= MAX_VISITOR_MESSAGES) {
          return errorResponse(429, 'CHAT_SESSION_EXHAUSTED');
        }
        // Приветствие и первый вопрос бесплатны, дальше нужны контакты.
        if (session.leadCapturedAt === null && session.visitorMessages >= 1) {
          return errorResponse(403, 'CHAT_CONTACTS_REQUIRED');
        }

        session.locale = detectLocale(text, session.locale);
        session.visitorMessages += 1;
        record(session, 'VISITOR', text, null);

        const answered = answer(session, text);
        // Форма контактов — в ответе на первое сообщение (§5.1). На сам вопрос
        // бот отвечает сразу: первый вопрос бесплатный, ждать нечего.
        if (session.leadCapturedAt === null) {
          return jsonResponse(200, { reply: { ...answered, needsContacts: true } });
        }
        return jsonResponse(200, { reply: answered });
      }

      if (action === 'contacts') {
        const payload = (body ?? {}) as { name?: string; email?: string; phone?: string };
        const name = String(payload.name ?? '').trim();
        const email = String(payload.email ?? '').trim();
        const phone = normalizeArmenianPhone(String(payload.phone ?? ''));
        const details: { field: string; code: string }[] = [];
        if (name.length < 2 || name.length > 120) details.push({ field: 'name', code: 'INVALID' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          details.push({ field: 'email', code: 'INVALID' });
        }
        if (!phone) details.push({ field: 'phone', code: 'INVALID' });
        if (details.length > 0) return errorResponse(400, 'VALIDATION_FAILED', details);

        session.contactName = name;
        session.contactEmail = email;
        session.contactPhone = phone;
        session.leadCapturedAt = new Date().toISOString();
        const thanks = reply(service('contacts_thanks', session.locale), 'contacts_thanks');
        record(session, 'BOT', thanks.text, thanks.entryId);
        return jsonResponse(200, { reply: thanks });
      }

      // handoff — идемпотентен: повторный вызов не плодит уведомления.
      session.handoffRequestedAt ??= new Date().toISOString();
      const done = reply(service('handoff_done', session.locale), 'handoff_done');
      record(session, 'BOT', done.text, done.entryId);
      return jsonResponse(200, { reply: done });
    }

    /* ------------------------------- админка ------------------------------ */

    if (path.startsWith('/admin/chat/sessions')) {
      const handled = /^\/admin\/chat\/sessions\/([^/]+)\/handled$/.exec(path);
      if (handled && method === 'POST') {
        const session = sessions.get(handled[1] ?? '');
        if (!session) return errorResponse(404, 'NOT_FOUND');
        session.handledAt ??= new Date().toISOString();
        return jsonResponse(200, toView(session));
      }

      const one = /^\/admin\/chat\/sessions\/([^/?]+)$/.exec(path);
      if (one && method === 'GET') {
        const session = sessions.get(one[1] ?? '');
        if (!session) return errorResponse(404, 'NOT_FOUND');
        return jsonResponse(200, toView(session));
      }

      if (method === 'GET') {
        const query = new URLSearchParams(path.split('?')[1] ?? '');
        const handledFilter = query.get('handled');
        const page = Number.parseInt(query.get('page') ?? '1', 10) || 1;
        const perPage = Number.parseInt(query.get('perPage') ?? '20', 10) || 20;
        const all = leadRows().filter((row) =>
          handledFilter === null ? true : row.handled === (handledFilter === 'true'),
        );
        return jsonResponse(200, {
          items: all.slice((page - 1) * perPage, page * perPage),
          total: all.length,
          page,
          perPage,
        });
      }
    }

    return null;
  };

  return {
    calls,
    rows: leadRows,
    reset: () => {
      sessions.clear();
      messages.length = 0;
      calls.length = 0;
      counter = 0;
    },
    fetch: async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = url.startsWith(API_URL) ? url.slice(API_URL.length) : url;
      const body: unknown =
        typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;

      const response = await handle(path, method, body);
      if (response) {
        calls.push({ method, path, body });
        return response;
      }
      if (options.passthrough) return options.passthrough(input, init);
      return errorResponse(404, 'NOT_FOUND');
    },
  };
}

/**
 * Ставит мок вместо `globalThis.fetch` и отдаёт функцию снятия.
 * Используется в тестах и в разработке (`VITE_CHAT_MOCK=1`).
 */
export function installChatMock(): { server: ChatMockServer; restore: () => void } {
  const original = globalThis.fetch;
  const server = createChatMockServer({ passthrough: original });
  globalThis.fetch = server.fetch as typeof fetch;
  return {
    server,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/**
 * Состояние разговора.
 *
 * Вся работа с сетью собрана здесь, компоненты только рисуют. Правила, за
 * которые отвечает этот хук (docs/CHAT.md §5.1, §7.3):
 *
 *  · сессия создаётся не при загрузке страницы, а при первом открытии панели:
 *    закрытый виджет не создаёт лидов и не шлёт ни одного запроса;
 *  · `sessionId` и снимок ленты переживают перезагрузку (см. `storage.ts`);
 *  · `404` от сервера — сессия истекла или неизвестна: виджет МОЛЧА заводит
 *    новую и повторяет действие один раз. Видимая лента при этом не
 *    стирается, а приветствие новой сессии не дублируется — посетитель
 *    ничего не замечает, как и требует контракт;
 *  · перед ответом бота показывается индикатор «печатает» 400–700 мс:
 *    мгновенная выдача выглядит как подстановка.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toApiLocale } from '@/i18n';
import type { Locale } from '@/i18n';
import { ApiError } from '@/lib/http';
import {
  CHAT_CONTACTS_REQUIRED,
  CHAT_SESSION_EXHAUSTED,
  CHAT_SESSION_NOT_FOUND,
  chatApi,
} from './api';
import { clearStoredSession, readStoredSession, writeStoredSession } from './storage';
import type { ChatContactsValues } from './contacts';
import { normalizeArmenianPhone } from './contacts';
import type { ChatMessageView, ChatReply } from './types';

/** Пауза перед ответом бота (§7.3). */
const TYPING_MIN_MS = 400;
const TYPING_MAX_MS = 700;

function typingPauseMs(): number {
  return TYPING_MIN_MS + Math.round(Math.random() * (TYPING_MAX_MS - TYPING_MIN_MS));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

let localId = 0;
const nextId = (): string => `cm${++localId}`;

function visitorMessage(text: string): ChatMessageView {
  return { id: nextId(), author: 'visitor', text };
}

function botMessage(reply: ChatReply): ChatMessageView {
  return {
    id: nextId(),
    author: 'bot',
    text: reply.text,
    entryId: reply.entryId,
    ...(reply.actions.length > 0 ? { actions: reply.actions } : {}),
    ...(reply.suggestions.length > 0 ? { suggestions: reply.suggestions } : {}),
  };
}

export interface ChatController {
  messages: ChatMessageView[];
  /** Идёт запрос: поле ввода и кнопки заблокированы. */
  busy: boolean;
  /** Показывать индикатор «бот печатает». */
  typing: boolean;
  /** Форма контактов внутри ленты. */
  needsContacts: boolean;
  contactsSaved: boolean;
  /** Код ошибки для `errors.*`; `null` — ошибки нет. */
  errorCode: string | null;
  /** Разговор исчерпан (429) — дописывать нечего. */
  exhausted: boolean;
  start: () => void;
  send: (text: string) => void;
  submitContacts: (values: ChatContactsValues) => Promise<boolean>;
  requestHandoff: () => void;
}

export function useChat(locale: Locale): ChatController {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [needsContacts, setNeedsContacts] = useState(false);
  const [contactsSaved, setContactsSaved] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);

  /** `sessionId` держится в ref: его читают обработчики, а перерисовка от него не нужна. */
  const sessionId = useRef<string | null>(null);
  const started = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Снимок пишется после каждого изменения ленты: отдельного «сохранить»
  // нет, потому что терять разговор нельзя ни на одном шаге.
  useEffect(() => {
    if (!sessionId.current) return;
    writeStoredSession({
      version: 1,
      sessionId: sessionId.current,
      messages,
      needsContacts,
      contactsSaved,
    });
  }, [messages, needsContacts, contactsSaved]);

  /**
   * Создаёт сессию на сервере. `keepFeed` — восстановление после `404`:
   * приветствие новой сессии в непустую ленту не добавляется.
   */
  const createSession = useCallback(
    async (keepFeed: boolean): Promise<string> => {
      const created = await chatApi.createSession({
        locale: toApiLocale(locale),
        pageUrl: typeof window === 'undefined' ? undefined : window.location.href,
      });
      sessionId.current = created.sessionId;
      if (keepFeed) {
        // Восстановление после `404`: приветствие нужно только пустой ленте.
        setMessages((current) =>
          current.length === 0 ? [botMessage(created.reply)] : [...current],
        );
      } else {
        setMessages([botMessage(created.reply)]);
        setNeedsContacts(created.reply.needsContacts);
        setContactsSaved(false);
      }
      return created.sessionId;
    },
    [locale],
  );

  /** Гарантирует живой `sessionId`: восстановленный из хранилища или новый. */
  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId.current) return sessionId.current;
    const stored = readStoredSession();
    if (stored) {
      sessionId.current = stored.sessionId;
      return stored.sessionId;
    }
    return createSession(false);
  }, [createSession]);

  /**
   * Выполняет действие над сессией. `404` — сессия истекла: заводим новую
   * и повторяем ровно один раз, молча.
   */
  const withSession = useCallback(
    async <T>(run: (id: string) => Promise<T>): Promise<T> => {
      const id = await ensureSession();
      try {
        return await run(id);
      } catch (error) {
        const notFound =
          error instanceof ApiError &&
          (error.code === CHAT_SESSION_NOT_FOUND || error.status === 404);
        if (!notFound) throw error;
        clearStoredSession();
        sessionId.current = null;
        const fresh = await createSession(true);
        return run(fresh);
      }
    },
    [createSession, ensureSession],
  );

  /** Применяет ответ бота: пауза «печатает», затем сообщение в ленту. */
  const applyReply = useCallback(async (reply: ChatReply, pause: boolean): Promise<void> => {
    if (pause) {
      setTyping(true);
      await wait(typingPauseMs());
    }
    if (!alive.current) return;
    setTyping(false);
    setMessages((current) => [...current, botMessage(reply)]);
    if (reply.needsContacts) setNeedsContacts(true);
  }, []);

  /**
   * Переводит отказ в код для `errors.*`. Два случая разбираются здесь, а не
   * в разметке: `403 CHAT_CONTACTS_REQUIRED` — это не ошибка для посетителя,
   * а пропущенная форма контактов, а `429` закрывает разговор насовсем.
   */
  const handleError = useCallback((error: unknown): string | null => {
    if (!(error instanceof ApiError)) return 'UNKNOWN';
    if (error.code === CHAT_CONTACTS_REQUIRED) {
      setNeedsContacts(true);
      return null;
    }
    if (error.code === CHAT_SESSION_EXHAUSTED) setExhausted(true);
    return error.code;
  }, []);

  const start = useCallback((): void => {
    if (started.current) return;
    started.current = true;
    const stored = readStoredSession();
    if (stored) {
      sessionId.current = stored.sessionId;
      setMessages(stored.messages);
      setNeedsContacts(stored.needsContacts);
      setContactsSaved(stored.contactsSaved);
      // Лента восстановлена, но приветствие в ней уже было: нового запроса
      // не делаем. Если сессия на сервере умерла, это выяснится на первом
      // сообщении и обработается как `404`.
      if (stored.messages.length > 0) return;
    }
    setBusy(true);
    setTyping(true);
    void (async () => {
      try {
        await wait(typingPauseMs());
        await createSession(false);
        setErrorCode(null);
      } catch (error) {
        started.current = false;
        setErrorCode(handleError(error));
      } finally {
        if (alive.current) {
          setTyping(false);
          setBusy(false);
        }
      }
    })();
  }, [createSession, handleError]);

  const send = useCallback(
    (text: string): void => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setMessages((current) => [...current, visitorMessage(trimmed)]);
      setErrorCode(null);
      setBusy(true);
      void (async () => {
        try {
          const { reply } = await withSession((id) => chatApi.sendMessage(id, trimmed));
          await applyReply(reply, true);
        } catch (error) {
          setTyping(false);
          setErrorCode(handleError(error));
        } finally {
          if (alive.current) setBusy(false);
        }
      })();
    },
    [applyReply, busy, handleError, withSession],
  );

  const submitContacts = useCallback(
    async (values: ChatContactsValues): Promise<boolean> => {
      setBusy(true);
      setErrorCode(null);
      try {
        const { reply } = await withSession((id) =>
          chatApi.saveContacts(id, {
            name: values.name.trim(),
            email: values.email.trim(),
            // На сервер уходит уже нормализованный номер (§5.1).
            phone: normalizeArmenianPhone(values.phone) ?? values.phone.trim(),
          }),
        );
        setNeedsContacts(false);
        setContactsSaved(true);
        await applyReply(reply, true);
        return true;
      } catch (error) {
        setErrorCode(handleError(error));
        return false;
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [applyReply, handleError, withSession],
  );

  const requestHandoff = useCallback((): void => {
    if (busy) return;
    setBusy(true);
    setErrorCode(null);
    void (async () => {
      try {
        const { reply } = await withSession((id) => chatApi.handoff(id));
        await applyReply(reply, true);
      } catch (error) {
        setTyping(false);
        setErrorCode(handleError(error));
      } finally {
        if (alive.current) setBusy(false);
      }
    })();
  }, [applyReply, busy, handleError, withSession]);

  return {
    messages,
    busy,
    typing,
    needsContacts,
    contactsSaved,
    errorCode,
    exhausted,
    start,
    send,
    submitContacts,
    requestHandoff,
  };
}

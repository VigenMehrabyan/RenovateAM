/**
 * Разговор между загрузками страницы.
 *
 * Контракт (§7.3) требует две вещи: `sessionId` живёт в `sessionStorage`,
 * чтобы переход между страницами не обрывал разговор, а история — «в памяти
 * вкладки». Внутри SPA переход между маршрутами память и так не теряет;
 * обрывают разговор обычные ссылки (`/#packages` в футере) — там вкладка
 * перезагружается целиком. Поэтому рядом с `sessionId` кладётся снимок самой
 * ленты: `sessionStorage` — это и есть память вкладки, он живёт ровно столько
 * же (закрыли вкладку — ничего не осталось) и не виден другим вкладкам.
 * Без снимка посетитель после такой ссылки возвращался бы к пустой панели
 * при живой сессии на сервере, а перечитать разговор контрактом нечем:
 * GET-эндпоинта у сессии нет.
 *
 * Всё хранилище необязательное: приватный режим может запрещать запись,
 * и тогда виджет просто работает без восстановления.
 */
import type { ChatMessageView } from './types';

const KEY = 'renovateam.chat.session';

/** Снимок разговора. Версия — чтобы старый формат не ломал ленту после релиза. */
export interface StoredChatSession {
  version: 1;
  sessionId: string;
  messages: ChatMessageView[];
  needsContacts: boolean;
  contactsSaved: boolean;
}

export function readStoredSession(): StoredChatSession | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<StoredChatSession>;
    if (candidate.version !== 1 || typeof candidate.sessionId !== 'string') return null;
    return {
      version: 1,
      sessionId: candidate.sessionId,
      messages: Array.isArray(candidate.messages) ? candidate.messages : [],
      needsContacts: candidate.needsContacts === true,
      contactsSaved: candidate.contactsSaved === true,
    };
  } catch {
    return null;
  }
}

export function writeStoredSession(value: StoredChatSession): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* приватный режим — разговор просто не переживёт перезагрузку */
  }
}

export function clearStoredSession(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* нечего чистить */
  }
}

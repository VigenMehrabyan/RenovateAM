import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import {
  CHAT_THROTTLER,
  CHAT_THROTTLER_LIMIT,
  DEFAULT_THROTTLER,
  DEFAULT_THROTTLER_LIMIT,
  THROTTLER_GROUPS,
  THROTTLER_WINDOW_MS,
  isChatDialogueRequest,
} from './throttler-groups';

/**
 * Контекст запроса с заданным путём. Нужен ровно тот минимум, который
 * читает предикат: тип транспорта и путь.
 */
function httpContext(path: string): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ path }) }),
  } as unknown as ExecutionContext;
}

/** Группа лимитов по имени. */
function group(name: string) {
  const found = THROTTLER_GROUPS.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`группа троттлинга "${name}" не объявлена`);
  return found;
}

describe('группы троттлинга', () => {
  it('у диалога чата своя группа: 20 запросов в минуту', () => {
    const chat = group(CHAT_THROTTLER);
    expect(chat.limit).toBe(CHAT_THROTTLER_LIMIT);
    expect(chat.limit).toBe(20);
    expect(chat.ttl).toBe(THROTTLER_WINDOW_MS);
  });

  it('остальной API живёт по прежнему лимиту', () => {
    const base = group(DEFAULT_THROTTLER);
    expect(base.limit).toBe(DEFAULT_THROTTLER_LIMIT);
    expect(base.ttl).toBe(THROTTLER_WINDOW_MS);
  });

  it('маршруты диалога попадают в группу chat', () => {
    for (const path of [
      '/api/v1/chat/sessions',
      '/api/v1/chat/sessions/0b2f17c0-0000-4000-8000-000000000001/messages',
      '/api/v1/chat/sessions/0b2f17c0-0000-4000-8000-000000000001/contacts',
      '/api/v1/chat/sessions/0b2f17c0-0000-4000-8000-000000000001/handoff',
    ]) {
      expect(isChatDialogueRequest(httpContext(path)), path).toBe(true);
    }
  });

  it('остальные маршруты в группу chat не попадают', () => {
    for (const path of [
      '/api/v1/auth/login',
      '/api/v1/pricing/estimate',
      '/api/v1/requests',
      // Админский список лидов — запрос сотрудника, а не посетителя:
      // менеджеру, листающему лиды, лимит виджета не нужен.
      '/api/v1/admin/chat/sessions',
      '/api/v1/admin/chat/sessions/0b2f17c0-0000-4000-8000-000000000001',
    ]) {
      expect(isChatDialogueRequest(httpContext(path)), path).toBe(false);
    }
  });

  it('группы не перекрываются: каждый запрос считается ровно одним лимитером', () => {
    for (const path of [
      '/api/v1/chat/sessions',
      '/api/v1/auth/login',
      '/api/v1/admin/chat/sessions',
    ]) {
      const applied = THROTTLER_GROUPS.filter(
        (candidate) => candidate.skipIf?.(httpContext(path)) !== true,
      );
      expect(
        applied.map((candidate) => candidate.name),
        path,
      ).toHaveLength(1);
    }
  });

  it('лимит чата не применяется ко всему API: иначе 20 запросов в минуту на весь сервис', () => {
    const chat = group(CHAT_THROTTLER);
    expect(chat.skipIf?.(httpContext('/api/v1/auth/login'))).toBe(true);
    expect(chat.skipIf?.(httpContext('/api/v1/chat/sessions'))).toBe(false);
  });

  it('не-HTTP контекст не считается запросом чата', () => {
    const rpc = { getType: () => 'rpc' } as unknown as ExecutionContext;
    expect(isChatDialogueRequest(rpc)).toBe(false);
  });
});

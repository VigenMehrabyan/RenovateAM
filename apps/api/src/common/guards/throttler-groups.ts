import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';

/**
 * Группы троттлинга.
 *
 * `@nestjs/throttler` применяет КАЖДЫЙ объявленный лимитер ко всем маршрутам,
 * пока лимитер сам не откажется от запроса через `skipIf`. Поэтому у каждой
 * группы здесь есть предикат «мой ли это запрос», а не декоратор на
 * контроллере: декоратором можно только снять лимит с маршрута, но нельзя
 * снять маршрут с лимита.
 *
 * Без этого группа `chat` с её 20 запросами в минуту срезала бы весь API
 * до двадцати запросов в минуту — тихо и на всех эндпоинтах сразу.
 */

/** Группа диалога чат-бота: 20 сообщений в минуту на IP (docs/CHAT.md §5.1). */
export const CHAT_THROTTLER = 'chat';

/** Группа по умолчанию для всего остального API. */
export const DEFAULT_THROTTLER = 'default';

/**
 * Запрос относится к диалогу чат-бота.
 *
 * Считаются только публичные маршруты виджета (`/chat/sessions…`). Админские
 * `/admin/chat/…` — обычные запросы сотрудника, им место в группе по
 * умолчанию: менеджер, листающий лиды, не посетитель.
 *
 * Разбирается путь, а не класс контроллера: группы живут в корневом модуле,
 * и ему незачем знать внутренние классы модуля chat.
 */
export function isChatDialogueRequest(context: ExecutionContext): boolean {
  if (context.getType() !== 'http') return false;
  const request = context.switchToHttp().getRequest<{ path?: string; url?: string }>();
  const path = request.path ?? request.url ?? '';
  if (path.includes('/admin/')) return false;
  return /\/chat\/sessions(\/|\?|$)/.test(path);
}

/** Окно лимитов — минута у обеих групп. */
export const THROTTLER_WINDOW_MS = 60_000;

/** Диалог чата: 20 сообщений в минуту на IP (docs/CHAT.md §5.1). */
export const CHAT_THROTTLER_LIMIT = 20;

/** Остальной API. */
export const DEFAULT_THROTTLER_LIMIT = 120;

/**
 * Группы лимитов для `ThrottlerModule.forRoot`.
 *
 * Объявлены здесь, а не в корневом модуле, чтобы числа и предикаты
 * проверялись тестом: глобальный троттлинг в тестовом окружении отключён
 * (AppThrottlerGuard), и через HTTP эти лимиты не проверить.
 */
export const THROTTLER_GROUPS: ThrottlerOptions[] = [
  {
    name: DEFAULT_THROTTLER,
    ttl: THROTTLER_WINDOW_MS,
    limit: DEFAULT_THROTTLER_LIMIT,
    skipIf: isChatDialogueRequest,
  },
  {
    name: CHAT_THROTTLER,
    ttl: THROTTLER_WINDOW_MS,
    limit: CHAT_THROTTLER_LIMIT,
    skipIf: (context) => !isChatDialogueRequest(context),
  },
];

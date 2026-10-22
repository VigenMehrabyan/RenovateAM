/**
 * Кнопки действий под ответом бота (§3.1, §7.3).
 *
 * Назначение каждой кнопки задано здесь, подписи — в i18n по `kind`.
 * `REQUEST` ведёт на `/requests/new` — это настоящий маршрут приложения
 * (в контракте он записан как `/request`, такого маршрута в приложении нет).
 * Instagram и телефон взяты из базы знаний (docs/chat-knowledge-base-ru.md,
 * темы «портфолио» и «связаться»), чтобы кнопка и ответ бота не расходились.
 */
import type { ChatActionKind } from './types';

export const INSTAGRAM_URL = 'https://www.instagram.com/renovate_am';
export const CONTACT_PHONE_E164 = '+37499099457';

export type ChatActionTarget =
  /** Внутренний маршрут приложения — обычный `<Link>`. */
  | { kind: 'route'; to: string }
  /** Внешняя ссылка — новая вкладка с `rel="noopener"`. */
  | { kind: 'external'; href: string }
  /** `tel:` — тот же обработчик, что у обычной ссылки. */
  | { kind: 'tel'; href: string }
  /** Не ссылка, а запрос к API: `POST /chat/sessions/:id/handoff`. */
  | { kind: 'handoff' };

export function chatActionTarget(action: ChatActionKind): ChatActionTarget {
  switch (action) {
    case 'ESTIMATE':
      return { kind: 'route', to: '/#calculator' };
    case 'REQUEST':
      return { kind: 'route', to: '/requests/new' };
    case 'PORTFOLIO':
      return { kind: 'external', href: INSTAGRAM_URL };
    case 'CALL':
      return { kind: 'tel', href: `tel:${CONTACT_PHONE_E164}` };
    case 'HUMAN':
      return { kind: 'handoff' };
  }
}

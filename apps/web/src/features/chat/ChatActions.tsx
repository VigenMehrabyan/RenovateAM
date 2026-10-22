/**
 * Кнопки действий под ответом бота (§7.3).
 *
 * Подписи берутся из i18n по `kind` — в разметке нет ни одной строки текста.
 * Назначение берётся из `actions.ts`: внутренние маршруты — обычным `<Link>`
 * (приложение не перезагружается, разговор не обрывается), Instagram —
 * новая вкладка с `rel="noopener"`, «позвать человека» — не ссылка, а запрос
 * `POST /chat/sessions/:id/handoff`.
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { chatActionTarget } from './actions';
import type { ChatActionKind } from './types';

const ACTION_CLASS =
  'chat-action touch-target inline-flex items-center justify-center rounded-xl border ' +
  'border-accent-200 bg-white px-3 py-2 text-sm font-medium text-accent-500';

export function ChatActions({
  actions,
  disabled,
  onHandoff,
}: {
  actions: ChatActionKind[];
  disabled: boolean;
  onHandoff: () => void;
}): JSX.Element | null {
  const { t } = useTranslation();
  if (actions.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {actions.map((action) => {
        const label = t(`chat.actions.${action}`);
        const target = chatActionTarget(action);

        if (target.kind === 'route') {
          return (
            <Link key={action} to={target.to} className={ACTION_CLASS}>
              {label}
            </Link>
          );
        }
        if (target.kind === 'external') {
          return (
            <a
              key={action}
              href={target.href}
              target="_blank"
              rel="noopener noreferrer"
              className={ACTION_CLASS}
            >
              {label}
            </a>
          );
        }
        if (target.kind === 'tel') {
          return (
            <a key={action} href={target.href} className={ACTION_CLASS}>
              {label}
            </a>
          );
        }
        return (
          <button
            key={action}
            type="button"
            className={ACTION_CLASS}
            disabled={disabled}
            onClick={onHandoff}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

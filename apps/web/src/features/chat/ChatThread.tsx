/**
 * Лента сообщений.
 *
 * Порядок внутри ленты задан контрактом (§7.3): приветствие с маскотом,
 * сообщения, форма контактов ВНУТРИ ленты после первого ответа, индикатор
 * «печатает» последней строкой. Кнопки действий и подсказки принадлежат
 * конкретному ответу бота и рисуются под ним, а не в отдельной панели.
 *
 * Лента — `<ol>`: это упорядоченный список реплик, и программа чтения
 * сообщает их число и позицию. `aria-live="polite"` объявляет новые
 * сообщения, не перебивая набор текста.
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui';
import { useCodeMessage } from '@/lib/use-error-message';
import { ChatActions } from './ChatActions';
import { ChatContactsForm } from './ChatContactsForm';
import { ChatMascot } from './ChatMascot';
import { ChatTyping } from './ChatTyping';
import type { ChatController } from './use-chat';

export function ChatThread({ controller }: { controller: ChatController }): JSX.Element {
  const { t } = useTranslation();
  const byCode = useCodeMessage();
  const scroller = useRef<HTMLDivElement>(null);

  // Лента всегда показывает последнюю реплику: прокрутка идёт по контейнеру,
  // а не через `scrollIntoView` — страница под виджетом не должна дёргаться.
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [controller.messages, controller.typing, controller.needsContacts]);

  const showContacts = controller.needsContacts && !controller.contactsSaved;

  return (
    <div className="chat-thread" ref={scroller}>
      <div className="chat-greeting">
        <ChatMascot size={96} />
      </div>

      <ol className="chat-messages" aria-live="polite" aria-relevant="additions">
        {controller.messages.map((message) => (
          <li
            key={message.id}
            className={message.author === 'visitor' ? 'flex justify-end' : 'flex justify-start'}
          >
            <div className="max-w-[85%]">
              <p
                className={`chat-bubble user-text ${
                  message.author === 'visitor' ? 'chat-bubble-visitor' : 'chat-bubble-bot'
                }`}
              >
                {message.text}
              </p>

              {message.author === 'bot' && message.actions ? (
                <ChatActions
                  actions={message.actions}
                  disabled={controller.busy}
                  onHandoff={controller.requestHandoff}
                />
              ) : null}

              {message.author === 'bot' && message.suggestions ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {message.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="chat-suggestion touch-target"
                      disabled={controller.busy || controller.exhausted}
                      onClick={() => controller.send(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        ))}

        {showContacts ? (
          <ChatContactsForm disabled={controller.busy} onSubmit={controller.submitContacts} />
        ) : null}

        {controller.typing ? <ChatTyping /> : null}
      </ol>

      {controller.errorCode ? (
        <Alert tone="danger" className="mt-3" title={t('errors.title')}>
          {byCode(controller.errorCode)}
        </Alert>
      ) : null}
    </div>
  );
}

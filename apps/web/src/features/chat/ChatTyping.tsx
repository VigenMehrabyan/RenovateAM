/**
 * Индикатор «бот печатает» (§7.3).
 *
 * Показывается 400–700 мс перед каждым ответом: ответ действительно
 * готовится, а мгновенная выдача выглядит как подстановка.
 *
 * Три точки — декорация, поэтому смысл несёт текстовая подпись в `sr-only`:
 * программа чтения сообщает «печатает…», а не читает пустой блок.
 * `role="status"` объявляет изменение вежливо, не перебивая ввод.
 */
import { useTranslation } from 'react-i18next';

export function ChatTyping(): JSX.Element {
  const { t } = useTranslation();
  return (
    <li className="flex justify-start">
      <p className="chat-bubble chat-bubble-bot chat-typing" role="status">
        <span className="sr-only">{t('chat.typing')}</span>
        <span className="chat-typing-dot" aria-hidden="true" />
        <span className="chat-typing-dot" aria-hidden="true" />
        <span className="chat-typing-dot" aria-hidden="true" />
      </p>
    </li>
  );
}

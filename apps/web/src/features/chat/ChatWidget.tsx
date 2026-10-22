/**
 * Виджет чата: кнопка в углу и панель разговора.
 *
 * Жёсткие требования заказчика (docs/CHAT.md §7.1) выполняются здесь:
 *
 *  1. Кнопка стоит на месте при любом скролле: `position: fixed` в правом
 *     нижнем углу (`.chat-launcher`), на мобильном с учётом safe-area.
 *  2. Появление ~220 мс, исчезновение ~180 мс — прозрачность плюс лёгкий
 *     подъём и масштаб. Панель остаётся в DOM на время закрывающей анимации
 *     (`CLOSE_MS`), иначе она исчезала бы мгновенно и никакая анимация
 *     закрытия не была бы видна. При `prefers-reduced-motion` остаётся
 *     только прозрачность (см. `index.css`).
 *  3. Закрывает ТОЛЬКО кнопка × и клавиша Escape. Обработчика клика вне
 *     панели нет вовсе — его нельзя «случайно вернуть», потому что затемнение
 *     (`.chat-overlay`) декоративное и не принимает указатель.
 *  4. Маскот — отдельный компонент, инлайновый SVG (`ChatMascot`).
 *  5. Ниже 640 px панель занимает весь экран, поле ввода поднимается над
 *     клавиатурой (`usePanelViewport`), все нажимаемые элементы — от 44 px.
 *
 * Диалог НЕ модальный: страница под ним остаётся рабочей, поэтому ни
 * `aria-modal`, ни ловушка фокуса здесь не нужны — они обещали бы
 * программе чтения поведение, которого нет.
 */
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { isLocale } from '@/i18n';
import { CHAT_TEXT_MAX_LENGTH } from './api';
import { ChatMascot } from './ChatMascot';
import { ChatThread } from './ChatThread';
import { useChat } from './use-chat';
import { usePanelViewport } from './use-panel-viewport';

/** Длительность закрывающей анимации, §7.1 п. 2. Держится в паре с `index.css`. */
const CLOSE_MS = 180;

const PANEL_ID = 'chat-panel';

/** Знак на кнопке: реплика с замковым камнем из знака компании. */
function LauncherGlyph(): JSX.Element {
  return (
    <svg
      viewBox="0 0 32 32"
      className="h-7 w-7"
      fill="none"
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <path
        d="M6 13a6 6 0 0 1 6-6h8a6 6 0 0 1 6 6v3a6 6 0 0 1-6 6h-6l-6 4v-4.6A6 6 0 0 1 6 16Z"
        stroke="#EDF1EE"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M13.2 13.6h5.6l-.6 3.3h-4.4Z" fill="#C9B183" />
    </svg>
  );
}

export function ChatWidget(): JSX.Element {
  const { t, i18n } = useTranslation();
  const locale = isLocale(i18n.language) ? i18n.language : 'ru';
  const controller = useChat(locale);

  const [open, setOpen] = useState(false);
  /** Панель в DOM: остаётся на время анимации закрытия. */
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState('');

  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  usePanelViewport(panel, open);

  const openPanel = (): void => {
    setMounted(true);
    setOpen(true);
    controller.start();
  };

  const closePanel = (): void => {
    setOpen(false);
    // Фокус возвращается на кнопку: иначе клавиатурный пользователь остаётся
    // в удалённой разметке без точки фокуса.
    launcher.current?.focus();
  };

  useEffect(() => {
    if (open || !mounted) return;
    const timer = setTimeout(() => setMounted(false), CLOSE_MS);
    return () => clearTimeout(timer);
  }, [open, mounted]);

  /** Escape — стандарт доступности, требованию «закрытие только по ×» не противоречит. */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      launcher.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  /**
   * Фокус уходит на саму панель, а не в поле ввода: на телефоне фокус в поле
   * мгновенно поднимает клавиатуру и прячет только что открытое приветствие.
   */
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  const submitDraft = (): void => {
    const text = draft.trim();
    if (!text || controller.busy || controller.exhausted) return;
    controller.send(text);
    setDraft('');
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter отправляет, Shift+Enter переносит строку: ожидаемое поведение
    // переписки. На узких экранах кнопка отправки остаётся на месте.
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    submitDraft();
  };

  return (
    <>
      <button
        ref={launcher}
        type="button"
        className="chat-launcher"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        aria-label={t('chat.launcher')}
        title={t('chat.launcher')}
        onClick={openPanel}
      >
        <LauncherGlyph />
      </button>

      {mounted ? (
        <>
          {/*
            Затемнение. Указатель не принимает и обработчика клика не имеет:
            заказчик отдельно оговорил, что клик вне панели чат НЕ закрывает.
          */}
          <div className="chat-overlay" data-state={open ? 'open' : 'closing'} aria-hidden="true" />

          <div
            ref={panel}
            id={PANEL_ID}
            className="chat-panel"
            data-state={open ? 'open' : 'closing'}
            role="dialog"
            aria-label={t('chat.title')}
            tabIndex={-1}
          >
            <div className="chat-panel-header">
              <ChatMascot size={32} still />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-50">{t('chat.title')}</p>
                <p className="truncate text-xs text-ink-200/85">{t('chat.subtitle')}</p>
              </div>
              <button
                type="button"
                className="chat-close"
                aria-label={t('common.close')}
                title={t('common.close')}
                onClick={closePanel}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <ChatThread controller={controller} />

            <div className="chat-composer">
              <label className="sr-only" htmlFor="chat-input">
                {t('chat.inputLabel')}
              </label>
              <textarea
                id="chat-input"
                className="chat-input"
                rows={1}
                maxLength={CHAT_TEXT_MAX_LENGTH}
                placeholder={t('chat.inputPlaceholder')}
                value={draft}
                disabled={controller.exhausted}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onInputKeyDown}
              />
              <Button
                type="button"
                className="chat-send"
                disabled={controller.busy || controller.exhausted || draft.trim().length === 0}
                onClick={submitDraft}
              >
                {t('chat.send')}
              </Button>
              <button
                type="button"
                className="chat-human"
                disabled={controller.busy}
                onClick={controller.requestHandoff}
              >
                {t('chat.actions.HUMAN')}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

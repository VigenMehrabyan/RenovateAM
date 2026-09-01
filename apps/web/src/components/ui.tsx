/**
 * Небольшой набор примитивов. Оформление задано токенами из tailwind.config.ts:
 * изумрудный акцент фирменного стиля, шампань — только акцентом, семантика
 * статусов вынесена отдельными цветами и с акцентом не смешивается.
 */
import { forwardRef } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { Link } from 'react-router-dom';
import type { RequestStatus } from '@/lib/api-types';
import { formatAmd } from '@/lib/format';

/* --------------------------------- Button ---------------------------------- */

/**
 * Варианты кнопок.
 *  · `primary`  — на светлом: изумруд со светлым текстом;
 *  · `onDark`   — на тёмной плоскости: шампань с тёмным текстом;
 *  · остальные — вспомогательные.
 * Заливка при наведении выезжает слева (`.btn-fill`), свечения нет.
 */
type ButtonVariant = 'primary' | 'onDark' | 'secondary' | 'ghost' | 'danger';

// Перенос подписи оставлен включённым намеренно: армянское «Ուղարկել հայտը
// մասնագետին» одной строкой задаёт кнопке min-content 265 px и вместе с полями
// карточки уводит страницу за 320 px. Кнопкам, которым перенос вреден
// (шапка), `whitespace-nowrap` ставится точечно.
const BUTTON_BASE =
  'btn-fill touch-target inline-flex items-center justify-center gap-2 rounded-none px-5 py-2 ' +
  'text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent-500 text-ink-50 [--btn-fill:#0a1f1a]',
  onDark: 'bg-gold-500 text-ink-900 [--btn-fill:#e3d2b2]',
  secondary: 'border border-ink-300 bg-white text-ink-800 [--btn-fill:#edf1ee]',
  ghost: 'text-accent-500 underline underline-offset-4 [--btn-fill:#edf1ee]',
  danger: 'border border-danger-500 bg-white text-danger-500 [--btn-fill:#f7eceb]',
};

/** Классы кнопки для случаев, где нужен обычный `<a>` (якорь на этой же странице). */
export function buttonClass(variant: ButtonVariant = 'primary', className = ''): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = 'primary', className = '', ...rest }: ButtonProps): JSX.Element {
  return <button className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`} {...rest} />;
}

export function ButtonLink({
  to,
  variant = 'primary',
  className = '',
  children,
}: {
  to: string;
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <Link to={to} className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`}>
      {children}
    </Link>
  );
}

/* --------------------------------- Page ------------------------------------ */

/**
 * Колонка содержимого прикладного экрана. Вынесена из Layout: лендинг
 * раскладывает плоскости на всю ширину сам, все остальные экраны живут
 * в общей колонке с одинаковыми полями.
 */
export function Page({
  children,
  className = '',
  width = 'wide',
  dense = false,
}: {
  children: ReactNode;
  className?: string;
  /** `prose` — узкая колонка для текстовых экранов, `form` — для форм. */
  width?: 'wide' | 'prose' | 'form';
  /**
   * Плотная вертикаль. Кабинет и админка: сметчик работает в очереди часами,
   * там нужна плотность, а не воздух.
   */
  dense?: boolean;
}): JSX.Element {
  const widths = { wide: 'max-w-6xl', prose: 'max-w-prose', form: 'max-w-xl' } as const;
  const padding = dense ? 'py-6' : 'py-8 sm:py-12';
  return (
    <div className={`mx-auto w-full ${widths[width]} px-4 ${padding} ${className}`}>{children}</div>
  );
}

/** Заголовок прикладного экрана: маркетинговая гарнитура, спокойный кегль. */
export function PageTitle({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return <h1 className={`display text-3xl sm:text-4xl ${className}`}>{children}</h1>;
}

/* --------------------------------- Fields ---------------------------------- */

interface FieldShellProps {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
  className?: string;
}

/** Обёртка поля: label, подсказка и ошибка, связанные через aria. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className = '',
}: FieldShellProps): JSX.Element {
  return (
    <div className={className}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="mt-1 text-sm text-ink-500" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const parts: string[] = [];
  if (hint && !error) parts.push(`${id}-hint`);
  if (error) parts.push(`${id}-error`);
  return parts.length ? parts.join(' ') : undefined;
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className = '', ...rest }, ref) {
    return <input ref={ref} className={`field-control ${className}`} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', ...rest }, ref) {
    return <select ref={ref} className={`field-control ${className}`} {...rest} />;
  },
);

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className = '', ...rest }, ref) {
  return <textarea ref={ref} className={`field-control ${className}`} rows={4} {...rest} />;
});

/* ---------------------------------- Alert ---------------------------------- */

type AlertTone = 'info' | 'warning' | 'success' | 'danger';

const ALERT_TONES: Record<AlertTone, string> = {
  info: 'border-l-accent-500 bg-accent-50 text-accent-900',
  warning: 'border-l-amber-500 bg-amber-50 text-amber-700',
  success: 'border-l-success-500 bg-success-50 text-success-600',
  danger: 'border-l-danger-500 bg-danger-50 text-danger-600',
};

export function Alert({
  tone = 'info',
  title,
  children,
  className = '',
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={`user-text border border-ink-200 border-l-[3px] px-4 py-3 text-sm ${ALERT_TONES[tone]} ${className}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? 'mt-1' : ''}>{children}</div> : null}
    </div>
  );
}

/* ------------------------------- StatusBadge -------------------------------- */

const STATUS_TONES: Record<RequestStatus, string> = {
  NEW: 'bg-ink-100 text-ink-700 border-ink-300',
  IN_PROGRESS: 'bg-accent-50 text-accent-700 border-accent-200',
  NEEDS_INFO: 'bg-amber-50 text-amber-700 border-amber-100',
  QUOTE_READY: 'bg-accent-500 text-ink-50 border-accent-500',
  ACCEPTED: 'bg-success-50 text-success-600 border-success-100',
  REJECTED: 'bg-danger-50 text-danger-600 border-danger-100',
};

export function StatusBadge({
  status,
  label,
}: {
  status: RequestStatus;
  label: string;
}): JSX.Element {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-none border px-2 py-1 text-xs font-medium ${STATUS_TONES[status]}`}
    >
      {label}
    </span>
  );
}

/* ---------------------------------- Money ---------------------------------- */

/** Сумма табличными цифрами: разряды не прыгают при пересчёте. */
export function Money({
  value,
  className = '',
}: {
  value: number;
  className?: string;
}): JSX.Element {
  return <span className={`tnum whitespace-nowrap ${className}`}>{formatAmd(value)}</span>;
}

/* -------------------------------- Structure -------------------------------- */

export function Section({
  title,
  description,
  children,
  className = '',
  id,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  id?: string;
}): JSX.Element {
  return (
    <section className={className} id={id}>
      {title ? <h2 className="text-lg font-semibold sm:text-xl">{title}</h2> : null}
      {description ? <p className="mt-1 max-w-prose text-sm text-ink-600">{description}</p> : null}
      <div className={title || description ? 'mt-4' : ''}>{children}</div>
    </section>
  );
}

/** Пара «поле — значение» для карточек параметров. */
export function DataRow({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-100 py-2 last:border-b-0">
      <dt className="user-text min-w-0 text-sm text-ink-600">{label}</dt>
      <dd className="user-text min-w-0 text-right text-sm font-medium text-ink-900">{value}</dd>
    </div>
  );
}

export function Spinner({ label }: { label: string }): JSX.Element {
  return (
    <p className="py-8 text-center text-sm text-ink-500" role="status">
      {label}
    </p>
  );
}

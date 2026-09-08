import { useTranslation } from 'react-i18next';
import { applyDocumentLocale, isLocale, LOCALES, storeLocale } from '@/i18n';
import type { Locale } from '@/i18n';

/**
 * Переключатель языка. Выбор сохраняется между сессиями (US-8) и меняет
 * `lang` на <html> — от него зависит и гарнитура (армянский Noto на hy).
 */
export function LanguageSwitcher({
  className = '',
  tone = 'light',
}: {
  className?: string;
  /** `dark` — вариант для тёмной плоскости футера. */
  tone?: 'light' | 'dark';
}): JSX.Element {
  const { t, i18n } = useTranslation();
  const current = isLocale(i18n.language) ? i18n.language : 'ru';

  const activeClass = tone === 'dark' ? 'bg-ink-100 text-ink-900' : 'bg-accent-500 text-ink-50';
  const idleClass =
    tone === 'dark'
      ? 'bg-transparent text-ink-100 hover:bg-white/10'
      : 'bg-transparent text-ink-600 hover:text-accent-500';

  const change = (locale: Locale): void => {
    void i18n.changeLanguage(locale);
    storeLocale(locale);
    applyDocumentLocale(locale);
  };

  return (
    // `inline-flex w-fit`: рамка обязана обтягивать три кнопки. В шапке
    // переключатель — элемент flex-строки и сжимался по содержимому сам, а в
    // колонке футера тот же блочный `flex` растягивался на всю ширину ячейки
    // сетки, и справа от EN оставалось до 200 px пустой рамки.
    <div
      className={`language-switcher inline-flex w-fit items-center ${className}`}
      role="group"
      aria-label={t('lang.label')}
    >
      {LOCALES.map((locale) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-pressed={active}
            onClick={() => change(locale)}
            className={`touch-target min-w-[44px] rounded-lg px-2 text-sm ${
              active ? activeClass : idleClass
            }`}
          >
            {locale.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

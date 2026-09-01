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

  const activeClass =
    tone === 'dark'
      ? 'border-gold-500 bg-gold-500 text-ink-900'
      : 'border-accent-500 bg-accent-500 text-ink-50';
  const idleClass =
    tone === 'dark'
      ? 'border-ink-700 bg-transparent text-ink-200 hover:border-gold-500 hover:text-gold-500'
      : 'border-ink-300 bg-white text-ink-600 hover:border-accent-400 hover:text-accent-500';

  const change = (locale: Locale): void => {
    void i18n.changeLanguage(locale);
    storeLocale(locale);
    applyDocumentLocale(locale);
  };

  return (
    <div className={`flex items-center ${className}`} role="group" aria-label={t('lang.label')}>
      {LOCALES.map((locale) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-pressed={active}
            onClick={() => change(locale)}
            className={`touch-target min-w-[44px] rounded-none border px-2 text-sm ${
              active ? activeClass : idleClass
            } -ml-px first:ml-0`}
          >
            {locale.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

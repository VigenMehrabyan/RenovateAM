import { useTranslation } from 'react-i18next';
import { applyDocumentLocale, isLocale, LOCALES, storeLocale } from '@/i18n';
import type { Locale } from '@/i18n';

/**
 * Переключатель языка. Выбор сохраняется между сессиями (US-8) и меняет
 * `lang` на <html> — от него зависит и гарнитура (армянский Noto на hy).
 */
export function LanguageSwitcher({ className = '' }: { className?: string }): JSX.Element {
  const { t, i18n } = useTranslation();
  const current = isLocale(i18n.language) ? i18n.language : 'ru';

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
            className={`touch-target min-w-[44px] border px-2 text-sm first:rounded-l last:rounded-r ${
              active
                ? 'border-accent-500 bg-accent-500 text-white'
                : 'border-ink-300 bg-white text-ink-600 hover:border-accent-400 hover:text-accent-600'
            } -ml-px first:ml-0`}
          >
            {locale.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

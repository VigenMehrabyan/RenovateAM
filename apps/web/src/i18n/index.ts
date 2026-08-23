import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hy from './locales/hy.json';
import ru from './locales/ru.json';

/** Локали интерфейса. `ru` — по умолчанию (MVP §4, US-8). */
export const LOCALES = ['ru', 'hy', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Код локали в формате API (`Locale` в контрактах — SCREAMING_CASE). */
export type ApiLocale = 'RU' | 'HY' | 'EN';

const STORAGE_KEY = 'renovateam.locale';

export function isLocale(value: string | null | undefined): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function toApiLocale(locale: Locale): ApiLocale {
  return locale.toUpperCase() as ApiLocale;
}

export function fromApiLocale(locale: string): Locale {
  const lower = locale.toLowerCase();
  return isLocale(lower) ? lower : 'ru';
}

/** Выбор языка переживает перезагрузку (US-8). */
export function readStoredLocale(): Locale | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* приватный режим — молча живём без сохранения */
  }
}

/** `lang` на <html> управляет и доступностью, и выбором гарнитуры (см. index.css). */
export function applyDocumentLocale(locale: Locale): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

function detectInitialLocale(): Locale {
  const stored = readStoredLocale();
  if (stored) return stored;
  if (typeof navigator !== 'undefined') {
    for (const candidate of navigator.languages ?? [navigator.language]) {
      const short = candidate?.slice(0, 2).toLowerCase();
      if (isLocale(short)) return short;
    }
  }
  return 'ru';
}

const initialLocale = detectInitialLocale();

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    hy: { translation: hy },
    en: { translation: en },
  },
  lng: initialLocale,
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
  returnNull: false,
});

applyDocumentLocale(initialLocale);

export default i18n;

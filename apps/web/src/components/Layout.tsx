import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { isStaff, useAuth } from '@/features/auth/auth-context';
import { ErrorBoundary } from './ErrorBoundary';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Button } from './ui';

const NAV_LINK =
  'touch-target inline-flex items-center px-2 text-sm text-ink-600 hover:text-accent-600 ' +
  'aria-[current=page]:text-accent-600 aria-[current=page]:font-medium';

export function Layout(): JSX.Element {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  /**
   * Escape закрывает раскрытое меню и возвращает фокус на кнопку: иначе
   * клавиатурный пользователь остаётся внутри свёрнутой разметки без фокуса.
   */
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const onLogout = async (): Promise<void> => {
    await logout();
    setMenuOpen(false);
    navigate('/');
  };

  const links = (
    <>
      <NavLink to="/" className={NAV_LINK} end onClick={() => setMenuOpen(false)}>
        {t('nav.calculator')}
      </NavLink>
      {user ? (
        <NavLink to="/cabinet" className={NAV_LINK} onClick={() => setMenuOpen(false)}>
          {t('nav.cabinet')}
        </NavLink>
      ) : null}
      {isStaff(user) ? (
        <NavLink to="/admin" className={NAV_LINK} end onClick={() => setMenuOpen(false)}>
          {t('nav.admin')}
        </NavLink>
      ) : null}
      {user?.role === 'ADMIN' ? (
        <NavLink to="/admin/rates" className={NAV_LINK} onClick={() => setMenuOpen(false)}>
          {t('admin.rates.title')}
        </NavLink>
      ) : null}
    </>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:px-3 focus:py-2"
      >
        {t('common.skipToContent')}
      </a>

      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" className="touch-target flex flex-wrap items-baseline gap-2 py-2">
            <span className="text-base font-semibold tracking-tight text-ink-900">
              {t('common.appName')}
            </span>
            {/* На md шапка уже показывает всю навигацию: слоган там только
                отжимает пункты меню в три строки. Возвращаем его на lg. */}
            <span className="hidden text-xs text-ink-500 lg:inline">{t('common.tagline')}</span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label={t('nav.menu')}>
            {links}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-2">
            <LanguageSwitcher className="hidden sm:flex" />
            {user ? (
              <Button variant="secondary" className="hidden md:inline-flex" onClick={onLogout}>
                {t('nav.logout')}
              </Button>
            ) : (
              <Link to="/login" className={`${NAV_LINK} hidden md:inline-flex`}>
                {t('nav.login')}
              </Link>
            )}
            <button
              ref={menuButtonRef}
              type="button"
              className="touch-target min-w-[44px] rounded border border-ink-300 px-3 text-sm md:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {t('nav.menu')}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div className="border-t border-ink-200 px-4 py-3 md:hidden" id="mobile-menu">
            <nav className="flex flex-col gap-1" aria-label={t('nav.menu')}>
              {links}
              {user ? (
                <Button variant="secondary" className="mt-2 self-start" onClick={onLogout}>
                  {t('nav.logout')}
                </Button>
              ) : (
                <NavLink to="/login" className={NAV_LINK} onClick={() => setMenuOpen(false)}>
                  {t('nav.login')}
                </NavLink>
              )}
            </nav>
            <LanguageSwitcher className="mt-3 sm:hidden" />
          </div>
        ) : null}
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-xs text-ink-500">
          <p>{t('result.disclaimer')}</p>
          <p className="mt-1">
            {t('common.appName')} · {t('common.tagline')}
          </p>
        </div>
      </footer>
    </div>
  );
}

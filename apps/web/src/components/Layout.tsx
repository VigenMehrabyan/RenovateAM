import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { isStaff, useAuth } from '@/features/auth/auth-context';
import { ErrorBoundary } from './ErrorBoundary';
import { LanguageSwitcher } from './LanguageSwitcher';
import { FooterLogo, HeaderLogo } from './brand';
import { Button } from './ui';

const NAV_LINK =
  'touch-target inline-flex items-center whitespace-nowrap px-2 text-sm text-ink-600 ' +
  'hover:text-accent-500 aria-[current=page]:text-accent-500 aria-[current=page]:font-medium';

const FOOTER_LINK = 'inline-flex py-1 text-sm text-ink-200/85 hover:text-gold-500';

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
          {/* `shrink-0`: пропорции логотипа менять нельзя (brand/README.md).
              Без этого во flex-строке на 768–960 px он ужимался по ширине при
              неизменной высоте — на 768 px надпись сплющивало до 92 px
              (вместо 223 px) и она переставала читаться. */}
          <Link to="/" className="touch-target flex shrink-0 items-center py-1">
            <HeaderLogo />
          </Link>

          {/* Разворот меню перенесён с `md` (768) на `lg` (1024): на 768–1023 px
              четырёх пунктов сотрудника, переключателя языка и кнопки выхода
              в строку не помещалось — шапка либо росла в две строки, либо
              выдавливала логотип. */}
          <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label={t('nav.menu')}>
            {links}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-2">
            <LanguageSwitcher className="hidden sm:flex" />
            {user ? (
              <Button
                variant="secondary"
                className="hidden whitespace-nowrap lg:inline-flex"
                onClick={onLogout}
              >
                {t('nav.logout')}
              </Button>
            ) : (
              <Link to="/login" className={`${NAV_LINK} hidden lg:inline-flex`}>
                {t('nav.login')}
              </Link>
            )}
            <button
              ref={menuButtonRef}
              type="button"
              className="touch-target min-w-[44px] shrink-0 whitespace-nowrap rounded-none border border-ink-300 px-3 text-sm lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {t('nav.menu')}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div className="border-t border-ink-200 px-4 py-3 lg:hidden" id="mobile-menu">
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

      {/* Ширину и поля задаёт сам экран: лендинг раскладывает плоскости
          на всю ширину, прикладные экраны — через <Page>. */}
      <main id="main" className="flex-1">
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <Footer />
    </div>
  );
}

function Footer(): JSX.Element {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <footer className="on-dark bg-ink-900 text-ink-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <FooterLogo />
            <p className="mt-4 max-w-xs text-sm text-ink-200/85">{t('common.tagline')}</p>
          </div>

          <nav aria-labelledby="footer-nav">
            <h2 className="eyebrow-gold" id="footer-nav">
              {t('footer.navTitle')}
            </h2>
            <ul className="mt-3">
              <li>
                <Link to="/" className={FOOTER_LINK}>
                  {t('nav.calculator')}
                </Link>
              </li>
              {user ? (
                <li>
                  <Link to="/cabinet" className={FOOTER_LINK}>
                    {t('nav.cabinet')}
                  </Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link to="/login" className={FOOTER_LINK}>
                      {t('nav.login')}
                    </Link>
                  </li>
                  <li>
                    <Link to="/register" className={FOOTER_LINK}>
                      {t('nav.register')}
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </nav>

          <nav aria-labelledby="footer-sections">
            <h2 className="eyebrow-gold" id="footer-sections">
              {t('footer.sectionsTitle')}
            </h2>
            <ul className="mt-3">
              <li>
                <a href="/#packages" className={FOOTER_LINK}>
                  {t('footer.anchors.packages')}
                </a>
              </li>
              <li>
                <a href="/#how-it-works" className={FOOTER_LINK}>
                  {t('footer.anchors.steps')}
                </a>
              </li>
              <li>
                <a href="/#package-contents" className={FOOTER_LINK}>
                  {t('footer.anchors.included')}
                </a>
              </li>
              <li>
                <a href="/#faq" className={FOOTER_LINK}>
                  {t('footer.anchors.faq')}
                </a>
              </li>
            </ul>
          </nav>

          <div>
            <h2 className="eyebrow-gold">{t('lang.label')}</h2>
            <LanguageSwitcher className="mt-3" tone="dark" />
          </div>
        </div>

        <div className="mt-10 border-t border-ink-700 pt-6 text-xs text-ink-200/70">
          <p className="max-w-prose">{t('footer.legal')}</p>
          <p className="mt-2">{t('footer.rights', { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}

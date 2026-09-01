import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, ButtonLink, Page, PageTitle, Spinner } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { authApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { useErrorMessage } from '@/lib/use-error-message';

/** Состояние проверки ссылки. */
type VerifyState = 'idle' | 'checking' | 'success' | 'expired' | 'used' | 'invalid';

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Одна страница на весь поток подтверждения (ARCHITECTURE §6.4):
 *  · без токена — «письмо отправлено» с повторной отправкой раз в 60 секунд;
 *  · с токеном — проверка и три отдельных исхода: истекла, уже использована,
 *    недействительна.
 */
export function VerifyEmailPage(): JSX.Element {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { user, reload } = useAuth();
  const toMessage = useErrorMessage();

  const token = params.get('token');
  const emailFromQuery = params.get('email');
  const [state, setState] = useState<VerifyState>(token ? 'checking' : 'idle');
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendDone, setResendDone] = useState(false);
  // Окно в 60 секунд отсчитывается от реально отправленного письма (`?sent=1`
  // сразу после регистрации). Пользователь, пришедший сюда по баннеру
  // «Подтвердите e-mail», письма только что не получал — ему кнопка нужна
  // сразу, а не через минуту ожидания непонятно чего.
  const justSent = params.get('sent') === '1';
  const [cooldown, setCooldown] = useState(!token && justSent ? RESEND_COOLDOWN_SECONDS : 0);
  const verified = useRef(false);

  useEffect(() => {
    if (!token || verified.current) return;
    verified.current = true;

    void (async () => {
      try {
        await authApi.verify(token);
        setState('success');
        await reload();
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.code === 'TOKEN_EXPIRED') setState('expired');
          else if (error.code === 'TOKEN_ALREADY_USED') setState('used');
          else setState('invalid');
        } else {
          setState('invalid');
        }
      }
    })();
  }, [token, reload]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const resend = useCallback(async () => {
    setResendError(null);
    setResendDone(false);
    try {
      await authApi.resendVerification();
      setResendDone(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      if (error instanceof ApiError && error.retryAfterSeconds) {
        setCooldown(error.retryAfterSeconds);
      }
      setResendError(toMessage(error));
    }
  }, [toMessage]);

  const email = emailFromQuery ?? user?.email ?? null;

  const resendBlock = (
    <div className="mt-5">
      {resendDone ? (
        <Alert tone="success" className="mb-3">
          {t('auth.verify.resendDone')}
        </Alert>
      ) : null}
      {resendError ? (
        <Alert tone="danger" className="mb-3" title={t('errors.title')}>
          {resendError}
        </Alert>
      ) : null}
      <Button variant="secondary" onClick={() => void resend()} disabled={cooldown > 0 || !user}>
        {cooldown > 0
          ? t('auth.verify.resendCountdown', { seconds: cooldown })
          : t('auth.verify.resend')}
      </Button>
    </div>
  );

  return (
    <Page width="form">
      <PageTitle>{t('auth.verify.title')}</PageTitle>

      {state === 'checking' ? <Spinner label={t('auth.verify.checking')} /> : null}

      {state === 'idle' ? (
        <>
          <Alert tone="info" className="mt-4" title={t('auth.verify.sentTitle')}>
            {email ? t('auth.verify.sentText', { email }) : t('auth.verify.sentTextNoEmail')}
          </Alert>
          {resendBlock}
          <div className="mt-6">
            <ButtonLink to="/cabinet" variant="secondary">
              {t('auth.verify.toCabinet')}
            </ButtonLink>
          </div>
        </>
      ) : null}

      {state === 'success' ? (
        <>
          <Alert tone="success" className="mt-4" title={t('auth.verify.successTitle')}>
            {t('auth.verify.successText')}
          </Alert>
          <ButtonLink to="/cabinet" className="mt-5">
            {t('auth.verify.toCabinet')}
          </ButtonLink>
        </>
      ) : null}

      {state === 'expired' ? (
        <>
          <Alert tone="warning" className="mt-4" title={t('auth.verify.expiredTitle')}>
            {t('auth.verify.expiredText')}
          </Alert>
          {user ? (
            resendBlock
          ) : (
            <ButtonLink to="/login" className="mt-5">
              {t('auth.verify.toLogin')}
            </ButtonLink>
          )}
        </>
      ) : null}

      {state === 'used' ? (
        <>
          <Alert tone="info" className="mt-4" title={t('auth.verify.usedTitle')}>
            {t('auth.verify.usedText')}
          </Alert>
          <ButtonLink to="/login" className="mt-5">
            {t('auth.verify.toLogin')}
          </ButtonLink>
        </>
      ) : null}

      {state === 'invalid' ? (
        <>
          <Alert tone="danger" className="mt-4" title={t('auth.verify.invalidTitle')}>
            {t('auth.verify.invalidText')}
          </Alert>
          {user ? (
            resendBlock
          ) : (
            <ButtonLink to="/login" className="mt-5">
              {t('auth.verify.toLogin')}
            </ButtonLink>
          )}
        </>
      ) : null}
    </Page>
  );
}

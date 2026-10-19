import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  ButtonLink,
  Field,
  Page,
  PageTitle,
  PasswordInput,
  describedBy,
} from '@/components/ui';
import { authApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { useErrorMessage } from '@/lib/use-error-message';
import { resetPasswordSchema } from '@/lib/validation';
import type { ResetPasswordValues } from '@/lib/validation';

/** Исход проверки ссылки. */
type ResetState = 'form' | 'success' | 'expired' | 'used' | 'invalid';

/**
 * Установка нового пароля по ссылке из письма (US-10).
 *
 * В отличие от /verify, ссылка здесь не проверяется при открытии страницы:
 * проверка и смена пароля — одна операция, а токен одноразовый. Отдельная
 * предварительная проверка сжигала бы ссылку до того, как человек успел
 * придумать пароль.
 *
 * Три отдельных исхода «истекла / уже использована / недействительна» — те же
 * коды, что у верификации (TOKEN_EXPIRED, TOKEN_ALREADY_USED, TOKEN_INVALID),
 * но свои формулировки: экран знает, какую ссылку он проверял.
 */
export function ResetPasswordPage(): JSX.Element {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toMessage = useErrorMessage();

  const token = params.get('token');
  const [state, setState] = useState<ResetState>('form');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    if (!token) return;
    setFormError(null);
    try {
      await authApi.resetPassword(token, values.password);
      setState('success');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'TOKEN_EXPIRED') return setState('expired');
        if (error.code === 'TOKEN_ALREADY_USED') return setState('used');
        if (error.code === 'TOKEN_INVALID') return setState('invalid');
      }
      // Сетевой сбой или троттлинг — ссылка ещё жива, форма остаётся на месте.
      setFormError(toMessage(error));
    }
  });

  /**
   * После успеха человек отправляется на вход сам — но не мгновенно: экран
   * обязан успеть сказать, что пароль изменён и прежние сессии завершены.
   * Кнопка «К входу» рядом, ждать таймера не нужно.
   */
  useEffect(() => {
    if (state !== 'success') return;
    const timer = window.setTimeout(() => navigate('/login', { replace: true }), 3000);
    return () => window.clearTimeout(timer);
  }, [state, navigate]);

  const fieldError = (name: keyof ResetPasswordValues): string | undefined => {
    const message = errors[name]?.message;
    return message ? t(message) : undefined;
  };

  /** Ссылка больше не годится: честный текст и путь получить новую. */
  const dead = (tone: 'warning' | 'info' | 'danger', title: string, text: string): JSX.Element => (
    <>
      <Alert tone={tone} className="mt-4" title={title}>
        {text}
      </Alert>
      <div className="mt-5 flex flex-wrap gap-3">
        <ButtonLink to="/forgot">{t('auth.reset.requestNew')}</ButtonLink>
        <ButtonLink to="/login" variant="secondary">
          {t('auth.reset.toLogin')}
        </ButtonLink>
      </div>
    </>
  );

  return (
    <Page width="form" className="auth-page">
      <PageTitle>{t('auth.reset.title')}</PageTitle>

      {state === 'success' ? (
        <>
          <Alert tone="success" className="mt-4" title={t('auth.reset.successTitle')}>
            {t('auth.reset.successText')}
          </Alert>
          <ButtonLink to="/login" className="mt-5">
            {t('auth.reset.toLogin')}
          </ButtonLink>
        </>
      ) : null}

      {state === 'expired'
        ? dead('warning', t('auth.reset.expiredTitle'), t('auth.reset.expiredText'))
        : null}
      {state === 'used' ? dead('info', t('auth.reset.usedTitle'), t('auth.reset.usedText')) : null}
      {state === 'invalid'
        ? dead('danger', t('auth.reset.invalidTitle'), t('auth.reset.invalidText'))
        : null}

      {state === 'form' && !token
        ? dead('danger', t('auth.reset.missingTitle'), t('auth.reset.missingText'))
        : null}

      {state === 'form' && token ? (
        <>
          <p className="mt-2 max-w-prose text-sm text-ink-600">{t('auth.reset.lead')}</p>

          {formError ? (
            <Alert tone="danger" className="mt-4" title={t('errors.title')}>
              {formError}
            </Alert>
          ) : null}

          <form onSubmit={onSubmit} noValidate className="mt-5 grid gap-4">
            <Field
              id="password"
              label={t('auth.fields.password')}
              hint={t('auth.fields.passwordHint')}
              error={fieldError('password')}
            >
              <PasswordInput
                id="password"
                autoComplete="new-password"
                showLabel={t('auth.fields.passwordShow')}
                hideLabel={t('auth.fields.passwordHide')}
                aria-invalid={Boolean(fieldError('password'))}
                aria-describedby={describedBy(
                  'password',
                  t('auth.fields.passwordHint'),
                  fieldError('password'),
                )}
                {...register('password')}
              />
            </Field>

            <Field
              id="passwordConfirm"
              label={t('auth.fields.passwordConfirm')}
              error={fieldError('passwordConfirm')}
            >
              <PasswordInput
                id="passwordConfirm"
                autoComplete="new-password"
                showLabel={t('auth.fields.passwordShow')}
                hideLabel={t('auth.fields.passwordHide')}
                aria-invalid={Boolean(fieldError('passwordConfirm'))}
                aria-describedby={describedBy(
                  'passwordConfirm',
                  undefined,
                  fieldError('passwordConfirm'),
                )}
                {...register('passwordConfirm')}
              />
            </Field>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('common.saving') : t('auth.reset.submit')}
            </Button>
          </form>
        </>
      ) : null}
    </Page>
  );
}

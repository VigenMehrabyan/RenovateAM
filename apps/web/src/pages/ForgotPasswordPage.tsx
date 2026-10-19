import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Alert, Button, Field, Page, PageTitle, TextInput, describedBy } from '@/components/ui';
import { authApi } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';
import { forgotPasswordSchema } from '@/lib/validation';
import type { ForgotPasswordValues } from '@/lib/validation';

/**
 * Запрос письма со ссылкой восстановления (US-10).
 *
 * Экран результата намеренно НЕ сообщает, нашёлся ли аккаунт: формулировка
 * «если аккаунт существует, ссылка уже в пути» — не вежливость, а требование.
 * Сервер отвечает одинаково на любой адрес (ARCHITECTURE §6.5), и интерфейс,
 * сказавший «такого адреса нет», своими руками вернул бы перечислитель
 * аккаунтов, который на сервере закрыт.
 */
export function ForgotPasswordPage(): JSX.Element {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await authApi.forgotPassword(values.email);
      setSentTo(values.email);
    } catch (error) {
      // Сюда попадают только настоящие сбои: нет сети, троттлинг, 5xx.
      // «Адрес не найден» сервер не возвращает в принципе.
      setFormError(toMessage(error));
    }
  });

  const emailError = errors.email?.message ? t(errors.email.message) : undefined;

  if (sentTo) {
    return (
      <Page width="form" className="auth-page">
        <PageTitle>{t('auth.forgot.title')}</PageTitle>
        <Alert tone="info" className="mt-4" title={t('auth.forgot.sentTitle')}>
          {t('auth.forgot.sentText', { email: sentTo })}
        </Alert>
        <p className="mt-3 text-sm text-ink-600">{t('auth.forgot.sentHint')}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setSentTo(null);
              reset();
            }}
          >
            {t('auth.forgot.again')}
          </Button>
        </div>
        <p className="mt-5 text-sm text-ink-600">
          <Link
            to="/login"
            className="touch-target inline-flex items-center text-accent-500 underline underline-offset-4"
          >
            {t('auth.forgot.backToLogin')}
          </Link>
        </p>
      </Page>
    );
  }

  return (
    <Page width="form" className="auth-page">
      <PageTitle>{t('auth.forgot.title')}</PageTitle>
      <p className="mt-2 max-w-prose text-sm text-ink-600">{t('auth.forgot.lead')}</p>

      {formError ? (
        <Alert tone="danger" className="mt-4" title={t('errors.title')}>
          {formError}
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="mt-5 grid gap-4">
        <Field id="email" label={t('auth.fields.email')} error={emailError}>
          <TextInput
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(emailError)}
            aria-describedby={describedBy('email', undefined, emailError)}
            {...register('email')}
          />
        </Field>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('common.sending') : t('auth.forgot.submit')}
        </Button>
      </form>

      <p className="mt-5 text-sm text-ink-600">
        <Link
          to="/login"
          className="touch-target inline-flex items-center text-accent-500 underline underline-offset-4"
        >
          {t('auth.forgot.backToLogin')}
        </Link>
      </p>
    </Page>
  );
}

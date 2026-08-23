import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Alert, Button, Field, TextInput, describedBy } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { isLocale, toApiLocale } from '@/i18n';
import { authApi } from '@/lib/api';
import { readEstimate } from '@/lib/estimate-storage';
import { ApiError } from '@/lib/http';
import { useErrorMessage } from '@/lib/use-error-message';
import { registerSchema } from '@/lib/validation';
import type { RegisterValues } from '@/lib/validation';

export function RegisterPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { user, status, login } = useAuth();
  const navigate = useNavigate();
  const toMessage = useErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const stored = useMemo(() => readEstimate(), []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { phone: '+374' },
  });

  if (status === 'authenticated' && user) return <Navigate to="/cabinet" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setDuplicate(false);
    try {
      await authApi.register({
        ...values,
        locale: toApiLocale(isLocale(i18n.language) ? i18n.language : 'ru'),
        ...(stored?.estimateId ? { quickEstimateIds: [stored.estimateId] } : {}),
      });
      // Вход сразу после регистрации: до подтверждения e-mail кабинет доступен (US-2).
      try {
        await login(values.email, values.password);
      } catch {
        navigate('/login', { replace: true });
        return;
      }
      navigate(`/verify?sent=1&email=${encodeURIComponent(values.email)}`, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_ALREADY_REGISTERED') {
        setDuplicate(true);
        return;
      }
      setFormError(toMessage(error));
    }
  });

  const fieldError = (name: keyof RegisterValues): string | undefined => {
    const message = errors[name]?.message;
    return message ? t(message) : undefined;
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="text-2xl font-semibold">{t('auth.register.title')}</h1>
      <p className="mt-2 max-w-prose text-sm text-ink-600">{t('auth.register.lead')}</p>
      {stored ? (
        <p className="mt-1 text-sm text-ink-500">{t('auth.register.estimateAttached')}</p>
      ) : null}

      {duplicate ? (
        <Alert tone="warning" className="mt-4" title={t('errors.EMAIL_ALREADY_REGISTERED')}>
          <Link
            to="/login"
            className="touch-target inline-flex items-center text-accent-600 underline"
          >
            {t('auth.register.loginLink')}
          </Link>
        </Alert>
      ) : null}

      {formError ? (
        <Alert tone="danger" className="mt-4" title={t('errors.title')}>
          {formError}
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field
          id="fullName"
          label={t('auth.fields.fullName')}
          error={fieldError('fullName')}
          className="sm:col-span-2"
        >
          <TextInput
            id="fullName"
            autoComplete="name"
            aria-invalid={Boolean(fieldError('fullName'))}
            aria-describedby={describedBy('fullName', undefined, fieldError('fullName'))}
            {...register('fullName')}
          />
        </Field>

        <Field id="email" label={t('auth.fields.email')} error={fieldError('email')}>
          <TextInput
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(fieldError('email'))}
            aria-describedby={describedBy('email', undefined, fieldError('email'))}
            {...register('email')}
          />
        </Field>

        <Field
          id="phone"
          label={t('auth.fields.phone')}
          hint={t('auth.fields.phoneHint')}
          error={fieldError('phone')}
        >
          <TextInput
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+37410000000"
            aria-invalid={Boolean(fieldError('phone'))}
            aria-describedby={describedBy('phone', t('auth.fields.phoneHint'), fieldError('phone'))}
            {...register('phone')}
          />
        </Field>

        <Field
          id="address"
          label={t('auth.fields.address')}
          error={fieldError('address')}
          className="sm:col-span-2"
        >
          <TextInput
            id="address"
            autoComplete="street-address"
            aria-invalid={Boolean(fieldError('address'))}
            aria-describedby={describedBy('address', undefined, fieldError('address'))}
            {...register('address')}
          />
        </Field>

        <Field
          id="password"
          label={t('auth.fields.password')}
          hint={t('auth.fields.passwordHint')}
          error={fieldError('password')}
          className="sm:col-span-2"
        >
          <TextInput
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(fieldError('password'))}
            aria-describedby={describedBy(
              'password',
              t('auth.fields.passwordHint'),
              fieldError('password'),
            )}
            {...register('password')}
          />
        </Field>

        <Button type="submit" className="sm:col-span-2" disabled={isSubmitting}>
          {isSubmitting ? t('common.sending') : t('auth.register.submit')}
        </Button>
      </form>

      <p className="mt-5 text-sm text-ink-600">
        {t('auth.register.hasAccount')}{' '}
        <Link
          to="/login"
          className="touch-target inline-flex items-center text-accent-600 underline"
        >
          {t('auth.register.loginLink')}
        </Link>
      </p>
    </div>
  );
}

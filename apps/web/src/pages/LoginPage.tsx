import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Field, TextInput, describedBy } from '@/components/ui';
import { isStaff, useAuth } from '@/features/auth/auth-context';
import { useErrorMessage } from '@/lib/use-error-message';
import { loginSchema } from '@/lib/validation';
import type { LoginValues } from '@/lib/validation';

export function LoginPage(): JSX.Element {
  const { t } = useTranslation();
  const { login, user, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toMessage = useErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  if (status === 'authenticated' && user) {
    const target = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    return <Navigate to={target ?? (isStaff(user) ? '/admin' : '/cabinet')} replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const authenticated = await login(values.email, values.password);
      const target = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(target ?? (isStaff(authenticated) ? '/admin' : '/cabinet'), { replace: true });
    } catch (error) {
      setFormError(toMessage(error));
    }
  });

  const emailError = errors.email?.message ? t(errors.email.message) : undefined;
  const passwordError = errors.password?.message ? t(errors.password.message) : undefined;

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-2xl font-semibold">{t('auth.login.title')}</h1>

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

        <Field id="password" label={t('auth.fields.password')} error={passwordError}>
          <TextInput
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(passwordError)}
            aria-describedby={describedBy('password', undefined, passwordError)}
            {...register('password')}
          />
        </Field>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('common.sending') : t('auth.login.submit')}
        </Button>
      </form>

      <p className="mt-5 text-sm text-ink-600">
        {t('auth.login.noAccount')}{' '}
        <Link
          to="/register"
          className="touch-target inline-flex items-center text-accent-600 underline"
        >
          {t('auth.login.registerLink')}
        </Link>
      </p>
    </div>
  );
}

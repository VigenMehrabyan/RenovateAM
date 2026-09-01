/**
 * Защита маршрутов. Неавторизованного отправляем на вход и запоминаем, куда
 * он шёл; клиента в админку не пускаем (MVP §3). Проверка неподтверждённого
 * e-mail живёт не здесь: кабинет ему доступен, блокируется только отправка
 * заявки (US-2) — за это отвечает баннер на самом экране.
 */
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isStaff, useAuth } from '@/features/auth/auth-context';
import { Page, Spinner } from './ui';

export function RequireAuth(): JSX.Element {
  const { status } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  if (status === 'loading')
    return (
      <Page>
        <Spinner label={t('common.loading')} />
      </Page>
    );
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

export function RequireStaff(): JSX.Element {
  const { status, user } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  if (status === 'loading')
    return (
      <Page>
        <Spinner label={t('common.loading')} />
      </Page>
    );
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;
  if (!isStaff(user)) return <Navigate to="/cabinet" replace />;
  return <Outlet />;
}

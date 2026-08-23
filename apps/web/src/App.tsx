import { useTranslation } from 'react-i18next';
import { Link, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { RequireAuth, RequireStaff } from '@/components/guards';
import { CabinetPage } from '@/pages/CabinetPage';
import { EstimatePage } from '@/pages/EstimatePage';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { NewRequestPage } from '@/pages/NewRequestPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { VerifyEmailPage } from '@/pages/VerifyEmailPage';
import { AdminQueuePage } from '@/pages/admin/AdminQueuePage';
import { AdminRatesPage } from '@/pages/admin/AdminRatesPage';
import { AdminRequestPage } from '@/pages/admin/AdminRequestPage';

function NotFoundPage(): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="max-w-prose">
      <h1 className="text-2xl font-semibold">{t('notFound.title')}</h1>
      <p className="mt-2 text-ink-600">{t('notFound.text')}</p>
      <Link to="/" className="mt-4 inline-block text-accent-600 underline">
        {t('notFound.home')}
      </Link>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/estimate" element={<EstimatePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify" element={<VerifyEmailPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/cabinet" element={<CabinetPage />} />
          <Route path="/requests/new" element={<NewRequestPage />} />
        </Route>

        <Route element={<RequireStaff />}>
          <Route path="/admin" element={<AdminQueuePage />} />
          <Route path="/admin/requests/:id" element={<AdminRequestPage />} />
          <Route path="/admin/rates" element={<AdminRatesPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

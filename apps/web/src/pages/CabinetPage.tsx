import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Alert, ButtonLink, Page, Spinner, StatusBadge } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { requestsApi } from '@/lib/api';
import type { RequestResponse } from '@/lib/api-types';
import { formatDate } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';

/**
 * Личный кабинет: список заявок клиента.
 *
 * Заявок может быть несколько одновременно, поэтому кабинет двухуровневый:
 * здесь — строки, по которым клиент узнаёт свой объект (адрес, площадь, объём
 * работ, статус), а вся карточка — на `/cabinet/requests/:id`. Номер нужен
 * не для узнавания, а для разговора с сотрудником, поэтому он подписью, а не
 * заголовком строки.
 */
export function CabinetPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toMessage = useErrorMessage();

  /**
   * Нет пользователя — нет и запросов к его данным. Без этого условия
   * наблюдатель `useQuery` переживал выход: сразу после сброса кеша первая же
   * перерисовка (экран ещё смонтирован, редирект гварда — следующим кадром)
   * заводила запрос заново и возвращала в кеш заявки предыдущего пользователя.
   */
  const signedIn = Boolean(user);
  const verified = user?.emailVerified === true;

  const { data, isLoading, error } = useQuery({
    queryKey: ['requests', 'me'],
    queryFn: () => requestsApi.mine(),
    enabled: signedIn,
  });

  const requests = data ?? [];

  return (
    <Page dense>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-3xl">{t('cabinet.title')}</h1>
        {verified && requests.length > 0 ? (
          <ButtonLink to="/requests/new">{t('cabinet.createRequest')}</ButtonLink>
        ) : null}
      </div>

      {!verified ? (
        <Alert tone="warning" className="mt-4" title={t('auth.verify.bannerTitle')}>
          <p>{t('auth.verify.bannerText')}</p>
          <ButtonLink to="/verify" variant="secondary" className="mt-3">
            {t('auth.verify.bannerAction')}
          </ButtonLink>
        </Alert>
      ) : null}

      {isLoading || !signedIn ? <Spinner label={t('common.loading')} /> : null}

      {error ? (
        <Alert tone="danger" className="mt-4" title={t('errors.title')}>
          {toMessage(error)}
        </Alert>
      ) : null}

      {signedIn && !isLoading && !error && requests.length === 0 ? <EmptyState /> : null}

      {requests.length > 0 ? (
        <ul className="mt-6 divide-y divide-ink-200 border-y border-ink-200">
          {requests.map((request) => (
            <RequestRow key={request.id} request={request} locale={i18n.language} />
          ))}
        </ul>
      ) : null}
    </Page>
  );
}

/**
 * Пустое состояние. Клиент без заявок пришёл сюда не за сообщением «список
 * пуст», а за первым шагом: посчитать вилку. Кнопка ведёт в калькулятор,
 * а не в форму заявки — с расчётом заявка уходит сметчику уже с параметрами.
 */
function EmptyState(): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="surface mt-6 max-w-xl p-5">
      <h2 className="text-lg font-semibold">{t('cabinet.empty.title')}</h2>
      <p className="mt-2 text-sm text-ink-600">{t('cabinet.empty.text')}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <ButtonLink to="/#calculator">{t('cabinet.empty.calculate')}</ButtonLink>
        <ButtonLink to="/requests/new" variant="secondary">
          {t('cabinet.empty.skip')}
        </ButtonLink>
      </div>
    </div>
  );
}

function RequestRow({
  request,
  locale,
}: {
  request: RequestResponse;
  locale: string;
}): JSX.Element {
  const { t } = useTranslation();
  const estimate = request.estimate;

  return (
    <li>
      <Link
        to={`/cabinet/requests/${request.id}`}
        className="block px-1 py-4 hover:bg-ink-50 focus-visible:bg-ink-50"
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="user-text font-medium text-ink-900">{request.address}</p>
            <p className="tnum mt-1 text-xs text-ink-500">
              {t('cabinet.requestNumber', { number: request.number })}
            </p>
          </div>
          <StatusBadge status={request.status} label={t(`request.status.${request.status}`)} />
        </div>

        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-600">
          {estimate ? (
            <>
              <div className="flex gap-1">
                <dt>{t('calculator.area')}:</dt>
                <dd className="tnum text-ink-800">
                  {estimate.areaSqm} {t('common.sqm')}
                </dd>
              </div>
              <div className="flex gap-1">
                <dt>{t('calculator.workScope')}:</dt>
                <dd className="text-ink-800">
                  {t(`calculator.workScopeOptions.${estimate.workScope}`)}
                </dd>
              </div>
              <div className="flex gap-1">
                <dt>{t('calculator.finishPackage')}:</dt>
                <dd className="text-ink-800">
                  {t(`calculator.finishPackageOptions.${estimate.finishPackage}`)}
                </dd>
              </div>
            </>
          ) : (
            <div className="text-ink-500">{t('request.new.noEstimate')}</div>
          )}
        </dl>

        <p className="tnum mt-2 text-xs text-ink-500">
          {t('cabinet.createdAt')}: {formatDate(request.createdAt, locale)} ·{' '}
          {t('cabinet.updatedAt')}: {formatDate(request.updatedAt, locale)}
        </p>
      </Link>
    </li>
  );
}

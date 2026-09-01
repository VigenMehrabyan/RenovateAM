import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Alert,
  Button,
  Field,
  Money,
  Page,
  Select,
  Spinner,
  StatusBadge,
  TextInput,
} from '@/components/ui';
import { isStaff, useAuth } from '@/features/auth/auth-context';
import { adminApi } from '@/lib/api';
import { REQUEST_STATUSES } from '@/lib/api-types';
import type { RequestStatus } from '@/lib/api-types';
import { formatDate } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';

interface Filters {
  status: RequestStatus | '';
  phone: string;
  sort: 'createdAt:desc' | 'createdAt:asc';
  page: number;
}

const PAGE_SIZE = 20;

/**
 * Очередь сметчика. Таблица широкая — на узких экранах она скроллится внутри
 * своего контейнера, страница по горизонтали не едет.
 */
export function AdminQueuePage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toMessage = useErrorMessage();
  /** Не сотрудник — очередь не запрашивается вовсе, даже на кадр до редиректа. */
  const allowed = isStaff(user);
  const [filters, setFilters] = useState<Filters>({
    status: '',
    phone: '',
    sort: 'createdAt:desc',
    page: 1,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'requests', filters],
    queryFn: () =>
      adminApi.queue({
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.phone ? { phone: filters.phone } : {}),
        sort: filters.sort,
        page: filters.page,
        pageSize: PAGE_SIZE,
      }),
    enabled: allowed,
  });

  return (
    <Page dense>
      <h1 className="text-2xl font-semibold">{t('admin.queue.title')}</h1>

      <form
        className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters((current) => ({ ...current, page: 1 }));
        }}
      >
        <Field id="filter-status" label={t('admin.queue.filterStatus')}>
          <Select
            id="filter-status"
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value as RequestStatus | '',
                page: 1,
              }))
            }
          >
            <option value="">{t('admin.queue.filterAll')}</option>
            {REQUEST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`request.status.${status}`)}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="filter-phone" label={t('admin.queue.filterPhone')}>
          <TextInput
            id="filter-phone"
            type="tel"
            value={filters.phone}
            onChange={(event) =>
              setFilters((current) => ({ ...current, phone: event.target.value }))
            }
          />
        </Field>

        <Field id="filter-sort" label={t('admin.queue.sort')}>
          <Select
            id="filter-sort"
            value={filters.sort}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                sort: event.target.value as Filters['sort'],
                page: 1,
              }))
            }
          >
            <option value="createdAt:desc">{t('admin.queue.sortNewest')}</option>
            <option value="createdAt:asc">{t('admin.queue.sortOldest')}</option>
          </Select>
        </Field>

        <div className="flex items-end gap-2">
          <Button type="submit">{t('admin.queue.apply')}</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setFilters({ status: '', phone: '', sort: 'createdAt:desc', page: 1 })}
          >
            {t('admin.queue.reset')}
          </Button>
        </div>
      </form>

      {isLoading || !allowed ? <Spinner label={t('common.loading')} /> : null}

      {error ? (
        <Alert tone="danger" className="mt-5" title={t('errors.title')}>
          {toMessage(error)}
        </Alert>
      ) : null}

      {data ? (
        <>
          <p className="tnum mt-6 text-sm text-ink-600">
            {t('admin.queue.total', { count: data.total })}
          </p>

          {data.items.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">{t('admin.queue.empty')}</p>
          ) : (
            <div className="mt-3 overflow-x-auto border border-ink-200 bg-white">
              <table className="w-full min-w-[52rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
                    <th className="px-3 py-2 font-medium">{t('admin.queue.columns.number')}</th>
                    <th className="px-3 py-2 font-medium">{t('admin.queue.columns.status')}</th>
                    <th className="px-3 py-2 font-medium">{t('admin.queue.columns.client')}</th>
                    <th className="px-3 py-2 font-medium">{t('admin.queue.columns.phone')}</th>
                    <th className="px-3 py-2 font-medium">{t('admin.queue.columns.estimate')}</th>
                    <th className="px-3 py-2 font-medium">{t('admin.queue.columns.files')}</th>
                    <th className="px-3 py-2 font-medium">{t('admin.queue.columns.createdAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id} className="border-b border-ink-100 last:border-b-0">
                      <td className="tnum px-3 py-2">
                        <Link
                          to={`/admin/requests/${item.id}`}
                          className="touch-target inline-flex items-center text-accent-600 underline"
                        >
                          {item.number}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge
                          status={item.status}
                          label={t(`request.status.${item.status}`)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className="block max-w-[16rem] truncate">{item.client.fullName}</span>
                        {item.duplicatePhoneCount > 1 ? (
                          <span className="text-xs text-amber-700">
                            {t('admin.queue.duplicates', { count: item.duplicatePhoneCount })}
                          </span>
                        ) : null}
                      </td>
                      <td className="tnum px-3 py-2 whitespace-nowrap">{item.client.phone}</td>
                      <td className="px-3 py-2">
                        {item.estimateSummary ? (
                          <span className="tnum whitespace-nowrap">
                            <Money value={item.estimateSummary.amountMin} /> —{' '}
                            <Money value={item.estimateSummary.amountMax} />
                          </span>
                        ) : (
                          <span className="text-amber-700">{t('result.designer.badge')}</span>
                        )}
                      </td>
                      <td className="tnum px-3 py-2">{item.filesCount}</td>
                      <td className="tnum px-3 py-2 whitespace-nowrap">
                        {formatDate(item.createdAt, i18n.language)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={filters.page <= 1}
              onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
            >
              {t('common.prev')}
            </Button>
            <span className="tnum whitespace-nowrap text-sm text-ink-600">
              {t('admin.queue.page', { page: data.page })}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={data.page * data.pageSize >= data.total}
              onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
            >
              {t('common.next')}
            </Button>
          </div>
        </>
      ) : null}
    </Page>
  );
}

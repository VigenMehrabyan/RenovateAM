import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Alert, Button, Field, Page, Select, Spinner } from '@/components/ui';
import { isStaff, useAuth } from '@/features/auth/auth-context';
import { adminChatApi } from '@/features/chat/api';
import { formatDateTime } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';

/** Значение фильтра «обработан»: пустое — все (docs/CHAT.md §5.2). */
type HandledFilter = '' | 'false' | 'true';

const PER_PAGE = 20;

/**
 * Список лидов из чата (docs/CHAT.md §5.2, §7.4).
 *
 * Вёрстка и состояния повторяют очередь заявок (`AdminQueuePage`): та же
 * `Page dense`, тот же фильтр сверху, та же таблица со скроллом внутри
 * контейнера и та же пара кнопок пагинации. Новых паттернов здесь нет
 * намеренно — сметчик работает в обоих списках и не должен переучиваться.
 */
export function AdminChatPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toMessage = useErrorMessage();
  const allowed = isStaff(user);
  const [handled, setHandled] = useState<HandledFilter>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'chat', 'sessions', handled, page],
    queryFn: () =>
      adminChatApi.sessions({
        ...(handled === '' ? {} : { handled: handled === 'true' }),
        page,
        perPage: PER_PAGE,
      }),
    enabled: allowed,
  });

  return (
    <Page dense>
      <h1 className="text-2xl font-semibold">{t('admin.chat.title')}</h1>
      <p className="mt-2 max-w-prose text-sm text-ink-600">{t('admin.chat.lead')}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="chat-filter-handled" label={t('admin.chat.filterHandled')}>
          <Select
            id="chat-filter-handled"
            value={handled}
            onChange={(event) => {
              setHandled(event.target.value as HandledFilter);
              setPage(1);
            }}
          >
            <option value="">{t('admin.chat.filterAll')}</option>
            <option value="false">{t('admin.chat.filterOpen')}</option>
            <option value="true">{t('admin.chat.filterDone')}</option>
          </Select>
        </Field>
      </div>

      {isLoading || !allowed ? <Spinner label={t('common.loading')} /> : null}

      {error ? (
        <Alert tone="danger" className="mt-5" title={t('errors.title')}>
          {toMessage(error)}
        </Alert>
      ) : null}

      {data ? (
        <>
          <p className="tnum mt-6 text-sm text-ink-600">
            {t('admin.chat.total', { count: data.total })}
          </p>

          {data.items.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">{t('admin.chat.empty')}</p>
          ) : (
            <div className="mt-3 overflow-x-auto border border-ink-200 bg-white">
              <table className="w-full min-w-[52rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
                    <th className="px-3 py-2 font-medium">{t('admin.chat.columns.name')}</th>
                    <th className="px-3 py-2 font-medium">{t('admin.chat.columns.phone')}</th>
                    <th className="px-3 py-2 font-medium">{t('admin.chat.columns.email')}</th>
                    <th className="px-3 py-2 font-medium">{t('admin.chat.columns.question')}</th>
                    <th className="px-3 py-2 font-medium">{t('admin.chat.columns.createdAt')}</th>
                    <th className="px-3 py-2 font-medium">{t('admin.chat.columns.flags')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id} className="border-b border-ink-100 last:border-b-0">
                      <td className="px-3 py-2">
                        <Link
                          to={`/admin/chat/${item.id}`}
                          className="touch-target inline-flex items-center text-accent-600 underline"
                          title={t('admin.chat.openRow')}
                        >
                          {item.contactName ?? t('common.notSet')}
                        </Link>
                      </td>
                      <td className="tnum px-3 py-2 whitespace-nowrap">
                        {item.contactPhone ?? t('common.notSet')}
                      </td>
                      <td className="px-3 py-2">
                        <span className="block max-w-[14rem] truncate">
                          {item.contactEmail ?? t('common.notSet')}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="block max-w-[22rem] truncate">
                          {item.firstQuestion ?? t('common.notSet')}
                        </span>
                      </td>
                      <td className="tnum px-3 py-2 whitespace-nowrap">
                        {formatDateTime(item.createdAt, i18n.language)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex flex-col gap-1">
                          {item.handoffRequested ? (
                            <span className="text-xs text-amber-700">
                              {t('admin.chat.handoffFlag')}
                            </span>
                          ) : null}
                          {item.handled ? (
                            <span className="text-xs text-success-600">
                              {t('admin.chat.handledFlag')}
                            </span>
                          ) : null}
                        </span>
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
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              {t('common.prev')}
            </Button>
            <span className="tnum whitespace-nowrap text-sm text-ink-600">
              {t('admin.chat.page', { page: data.page })}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={data.page * data.perPage >= data.total}
              onClick={() => setPage((current) => current + 1)}
            >
              {t('common.next')}
            </Button>
          </div>
        </>
      ) : null}
    </Page>
  );
}

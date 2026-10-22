import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, DataRow, Page, Section, Spinner } from '@/components/ui';
import { isStaff, useAuth } from '@/features/auth/auth-context';
import { adminChatApi } from '@/features/chat/api';
import { formatDateTime } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';

/**
 * Разговор целиком и кнопка «Обработан» (docs/CHAT.md §5.2, §7.4).
 *
 * Строение то же, что у карточки заявки (`AdminRequestPage`): ссылка назад,
 * заголовок, карточка параметров на `DataRow` и лента ниже. Отметка
 * «обработан» необратима — повторный вызов на сервере идемпотентен,
 * поэтому кнопка просто исчезает, а не превращается в переключатель.
 */
export function AdminChatSessionPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const { user } = useAuth();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const allowed = isStaff(user);
  const queryKey = ['admin', 'chat', 'session', id];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => adminChatApi.session(id),
    enabled: allowed && Boolean(id),
  });

  const markHandled = useMutation({
    mutationFn: () => adminChatApi.markHandled(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'chat', 'sessions'] });
    },
  });

  if (isLoading || !allowed) return <Spinner label={t('common.loading')} />;
  if (error) {
    return (
      <Alert tone="danger" title={t('errors.title')}>
        {toMessage(error)}
      </Alert>
    );
  }
  if (!data) return <Alert tone="danger">{t('errors.NOT_FOUND')}</Alert>;

  return (
    <Page dense className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="flex min-w-0 flex-col gap-8">
        <div>
          <Link
            to="/admin/chat"
            className="touch-target inline-flex items-center text-sm text-accent-600 underline"
          >
            {t('admin.chat.session.back')}
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{t('admin.chat.session.title')}</h1>
            {data.handled ? (
              <span className="inline-flex items-center whitespace-nowrap rounded-full border border-success-100 bg-success-50 px-3 py-1 text-sm font-medium text-success-600">
                {t('admin.chat.handledFlag')}
              </span>
            ) : null}
          </div>
          {data.handoffRequested ? (
            <Alert tone="warning" className="mt-4">
              {t('admin.chat.session.handoffRequested')}
            </Alert>
          ) : null}
          {data.contactName === null && data.contactPhone === null ? (
            <Alert tone="info" className="mt-4">
              {t('admin.chat.session.noContacts')}
            </Alert>
          ) : null}
        </div>

        <Section title={t('admin.chat.session.conversationTitle')}>
          {data.messages.length === 0 ? (
            <p className="text-sm text-ink-500">{t('admin.chat.session.empty')}</p>
          ) : (
            <ol className="space-y-3">
              {data.messages.map((message) => (
                <li key={message.id} className="surface p-4">
                  <p className="flex flex-wrap items-baseline gap-x-3 text-xs text-ink-500">
                    <span className="font-medium text-ink-700">
                      {message.role === 'VISITOR'
                        ? t('admin.chat.session.visitor')
                        : t('admin.chat.session.bot')}
                    </span>
                    <span className="tnum">{formatDateTime(message.createdAt, i18n.language)}</span>
                    {message.entryId ? <span className="tnum">{message.entryId}</span> : null}
                  </p>
                  <p className="user-text mt-2 text-sm text-ink-800">{message.text}</p>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>

      <aside className="flex min-w-0 flex-col gap-6">
        <Section title={t('admin.chat.session.contactsTitle')}>
          <dl className="surface p-4">
            <DataRow
              label={t('admin.chat.columns.name')}
              value={data.contactName ?? t('common.notSet')}
            />
            <DataRow
              label={t('admin.chat.columns.phone')}
              value={
                data.contactPhone ? (
                  <a className="tnum underline" href={`tel:${data.contactPhone}`}>
                    {data.contactPhone}
                  </a>
                ) : (
                  t('common.notSet')
                )
              }
            />
            <DataRow
              label={t('admin.chat.columns.email')}
              value={
                data.contactEmail ? (
                  <a className="underline" href={`mailto:${data.contactEmail}`}>
                    {data.contactEmail}
                  </a>
                ) : (
                  t('common.notSet')
                )
              }
            />
            <DataRow label={t('admin.chat.session.locale')} value={data.locale} />
            <DataRow
              label={t('admin.chat.session.startedAt')}
              value={<span className="tnum">{formatDateTime(data.createdAt, i18n.language)}</span>}
            />
            <DataRow
              label={t('admin.chat.session.lastMessageAt')}
              value={
                <span className="tnum">{formatDateTime(data.lastMessageAt, i18n.language)}</span>
              }
            />
            <DataRow
              label={t('admin.chat.session.pageUrl')}
              value={data.pageUrl ?? t('common.notSet')}
            />
            <DataRow
              label={t('admin.chat.session.handledAt')}
              value={
                data.handledAt ? (
                  <span className="tnum">{formatDateTime(data.handledAt, i18n.language)}</span>
                ) : (
                  t('common.notSet')
                )
              }
            />
          </dl>

          {markHandled.error ? (
            <Alert tone="danger" className="mt-4" title={t('errors.title')}>
              {toMessage(markHandled.error)}
            </Alert>
          ) : null}

          {data.handled ? (
            <Alert tone="success" className="mt-4">
              {t('admin.chat.session.marked')}
            </Alert>
          ) : (
            <Button
              type="button"
              className="mt-4 w-full"
              disabled={markHandled.isPending}
              onClick={() => markHandled.mutate()}
            >
              {markHandled.isPending ? t('common.saving') : t('admin.chat.session.markHandled')}
            </Button>
          )}
        </Section>
      </aside>
    </Page>
  );
}

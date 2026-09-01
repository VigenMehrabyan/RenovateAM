import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  ButtonLink,
  DataRow,
  Field,
  Money,
  Page,
  Section,
  Select,
  Spinner,
  StatusBadge,
  TextArea,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { filesApi, requestsApi } from '@/lib/api';
import { openSignedUrl } from '@/lib/download';
import { REJECTION_REASONS } from '@/lib/api-types';
import type { RequestResponse } from '@/lib/api-types';
import { formatDateTime } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { decisionSchema } from '@/lib/validation';
import type { DecisionValues } from '@/lib/validation';

/**
 * Личный кабинет: одна активная заявка (MVP US-4), её статус, история
 * переходов, готовая смета и решение клиента.
 */
export function CabinetPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toMessage = useErrorMessage();

  /**
   * Нет пользователя — нет и запросов к его данным. Без этого условия
   * наблюдатель `useQuery` переживал выход: сразу после сброса кеша первая же
   * перерисовка (экран ещё смонтирован, редирект гварда — следующим кадром)
   * заводила запрос заново и возвращала в кеш заявку предыдущего пользователя.
   */
  const signedIn = Boolean(user);

  const { data, isLoading, error } = useQuery({
    queryKey: ['requests', 'me'],
    queryFn: () => requestsApi.mine(),
    enabled: signedIn,
  });

  const latest = data?.[0] ?? null;

  const detail = useQuery({
    queryKey: ['requests', latest?.id],
    queryFn: () => requestsApi.byId(latest?.id ?? ''),
    enabled: signedIn && Boolean(latest?.id),
  });

  const request = detail.data ?? latest;
  const verified = user?.emailVerified === true;

  return (
    <Page dense className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div>
        <h1 className="display text-3xl">{t('cabinet.title')}</h1>

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

        {signedIn && !isLoading && !request ? (
          <div className="mt-6">
            <p className="text-ink-600">{t('cabinet.noRequests')}</p>
            {verified ? (
              <ButtonLink to="/requests/new" className="mt-4">
                {t('cabinet.createRequest')}
              </ButtonLink>
            ) : null}
          </div>
        ) : null}

        {request ? <RequestPanel request={request} locale={i18n.language} /> : null}
      </div>

      {request ? (
        <aside>
          <StatusHistory request={request} locale={i18n.language} />
        </aside>
      ) : null}
    </Page>
  );
}

function RequestPanel({
  request,
  locale,
}: {
  request: RequestResponse;
  locale: string;
}): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">
          {t('cabinet.requestNumber', { number: request.number })}
        </h2>
        <StatusBadge status={request.status} label={t(`request.status.${request.status}`)} />
      </div>
      <p className="mt-1 text-sm text-ink-600">{t(`request.statusHint.${request.status}`)}</p>
      <p className="tnum mt-1 text-xs text-ink-500">
        {t('cabinet.createdAt')}: {formatDateTime(request.createdAt, locale)}
      </p>

      {request.comment ? (
        <Alert tone="info" className="mt-4" title={t('cabinet.commentTitle')}>
          {request.comment}
        </Alert>
      ) : null}

      <Section title={t('cabinet.quoteTitle')} className="mt-8">
        {request.quote ? (
          <div className="surface p-4">
            <dl>
              <DataRow
                label={t('cabinet.quoteTotal')}
                value={
                  <Money value={request.quote.totalAmount} className="text-lg font-semibold" />
                }
              />
              <DataRow
                label={t('cabinet.createdAt')}
                value={
                  <span className="tnum">{formatDateTime(request.quote.createdAt, locale)}</span>
                }
              />
            </dl>
            <QuoteDownload quoteId={request.quote.id} />
          </div>
        ) : (
          <p className="text-sm text-ink-500">{t('cabinet.noQuote')}</p>
        )}
      </Section>

      {request.decision ? (
        <Alert
          tone={request.decision.result === 'ACCEPTED' ? 'success' : 'danger'}
          className="mt-6"
          title={t('cabinet.decision.title')}
        >
          <p>
            {request.decision.result === 'ACCEPTED'
              ? t('cabinet.decision.madeAccepted', {
                  date: formatDateTime(request.decision.createdAt, locale),
                })
              : t('cabinet.decision.madeRejected', {
                  date: formatDateTime(request.decision.createdAt, locale),
                })}
          </p>
          {request.decision.reason ? (
            <p className="mt-1">{t(`cabinet.decision.reasons.${request.decision.reason}`)}</p>
          ) : null}
        </Alert>
      ) : request.status === 'QUOTE_READY' ? (
        <DecisionForm requestId={request.id} />
      ) : null}

      {request.files.length > 0 ? (
        <Section title={t('cabinet.filesTitle')} className="mt-8">
          <ul className="divide-y divide-ink-200 border-y border-ink-200">
            {request.files.map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-3 py-2">
                <span className="user-text min-w-0 text-sm">{file.originalName}</span>
                <FileDownload fileId={file.id} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

/**
 * Скачивание сметы клиентом. Отдельного клиентского эндпоинта для сметы в
 * §5.6 нет (`/admin/requests/:id/quote/download-url` — только для staff),
 * поэтому используется общий `/files/:id/download-url` с идентификатором сметы:
 * проверку владения сервер делает сам. Место требует уточнения контракта.
 */
function QuoteDownload({ quoteId }: { quoteId: string }): JSX.Element {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await openSignedUrl(() => filesApi.downloadUrl(quoteId));
    } catch (caught) {
      // Молчаливый отказ выглядел как сломанная кнопка: пользователь жал её
      // снова и снова, не понимая, что ссылку не выдали.
      setError(toMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="secondary" className="mt-4" disabled={busy} onClick={() => void open()}>
        {t('cabinet.quoteDownload')}
      </Button>
      {error ? (
        <Alert tone="danger" className="mt-3" title={t('errors.title')}>
          {error}
        </Alert>
      ) : null}
    </>
  );
}

function FileDownload({ fileId }: { fileId: string }): JSX.Element {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);

  const open = async (): Promise<void> => {
    setError(null);
    try {
      await openSignedUrl(() => filesApi.downloadUrl(fileId));
    } catch (caught) {
      setError(toMessage(caught));
    }
  };

  return (
    <span className="shrink-0">
      <Button variant="ghost" onClick={() => void open()}>
        {t('common.download')}
      </Button>
      {error ? (
        <span className="field-error block text-right" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

function DecisionForm({ requestId }: { requestId: string }): JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toMessage = useErrorMessage();
  const [mode, setMode] = useState<'idle' | 'accept' | 'reject'>('idle');
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<DecisionValues>({ resolver: zodResolver(decisionSchema) });

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof requestsApi.decide>[1]) =>
      requestsApi.decide(requestId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
      setMode('idle');
    },
    onError: (caught) => setError(toMessage(caught)),
  });

  const reason = watch('reason');
  const reasonError = errors.reason?.message ? t(errors.reason.message) : undefined;
  const commentError = errors.comment?.message ? t(errors.comment.message) : undefined;

  const onReject = handleSubmit((values) => {
    setError(null);
    mutation.mutate({
      result: 'REJECTED',
      ...(values.reason ? { reason: values.reason } : {}),
      ...(values.comment ? { comment: values.comment } : {}),
    });
  });

  return (
    <Section title={t('cabinet.decision.title')} className="mt-8">
      <p className="text-sm text-ink-600">{t('cabinet.decision.irreversible')}</p>

      {error ? (
        <Alert tone="danger" className="mt-3" title={t('errors.title')}>
          {error}
        </Alert>
      ) : null}

      {mode === 'idle' ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" onClick={() => setMode('accept')}>
            {t('cabinet.decision.accept')}
          </Button>
          <Button type="button" variant="danger" onClick={() => setMode('reject')}>
            {t('cabinet.decision.reject')}
          </Button>
        </div>
      ) : null}

      {mode === 'accept' ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              mutation.mutate({ result: 'ACCEPTED' });
            }}
          >
            {t('cabinet.decision.confirmAccept')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setMode('idle')}>
            {t('common.cancel')}
          </Button>
        </div>
      ) : null}

      {mode === 'reject' ? (
        <form onSubmit={onReject} noValidate className="mt-4 grid max-w-md gap-4">
          <Field id="reason" label={t('cabinet.decision.reasonLabel')} error={reasonError}>
            <Select
              id="reason"
              defaultValue=""
              aria-invalid={Boolean(reasonError)}
              aria-describedby={reasonError ? 'reason-error' : undefined}
              {...register('reason')}
            >
              <option value="" disabled>
                {t('cabinet.decision.reasonLabel')}
              </option>
              {REJECTION_REASONS.map((value) => (
                <option key={value} value={value}>
                  {t(`cabinet.decision.reasons.${value}`)}
                </option>
              ))}
            </Select>
          </Field>

          {reason === 'OTHER' ? (
            <Field id="comment" label={t('cabinet.decision.commentLabel')} error={commentError}>
              <TextArea
                id="comment"
                aria-invalid={Boolean(commentError)}
                aria-describedby={commentError ? 'comment-error' : undefined}
                {...register('comment')}
              />
            </Field>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="danger" disabled={mutation.isPending}>
              {t('cabinet.decision.confirmReject')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMode('idle')}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      ) : null}
    </Section>
  );
}

function StatusHistory({
  request,
  locale,
}: {
  request: RequestResponse;
  locale: string;
}): JSX.Element {
  const { t } = useTranslation();
  const entries = request.statusLog ?? [];

  return (
    <div className="surface p-4">
      <h2 className="eyebrow">{t('cabinet.historyTitle')}</h2>
      <ol className="mt-3 space-y-3">
        {entries.length === 0 ? (
          <li className="text-sm text-ink-500">
            <p>{t('cabinet.historyStart')}</p>
            <p className="tnum text-xs">{formatDateTime(request.createdAt, locale)}</p>
          </li>
        ) : null}
        {entries.map((entry) => (
          <li key={entry.id} className="border-l-2 border-ink-200 pl-3 text-sm">
            <p className="text-ink-800">
              {entry.fromStatus
                ? t('cabinet.historyEntry', {
                    from: t(`request.status.${entry.fromStatus}`),
                    to: t(`request.status.${entry.toStatus}`),
                  })
                : t('cabinet.historyStart')}
            </p>
            <p className="tnum text-xs text-ink-500">{formatDateTime(entry.createdAt, locale)}</p>
            {entry.comment ? (
              <p className="user-text mt-1 text-xs text-ink-600">{entry.comment}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  DataRow,
  Field,
  Money,
  Page,
  Section,
  Select,
  Spinner,
  StatusBadge,
  TextArea,
  TextInput,
} from '@/components/ui';
import { isStaff, useAuth } from '@/features/auth/auth-context';
import { adminApi, filesApi } from '@/lib/api';
import { openSignedUrl } from '@/lib/download';
import { STAFF_TRANSITIONS } from '@/lib/api-types';
import type { RequestResponse, RequestStatus } from '@/lib/api-types';
import { formatDateTime } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';

/** Карточка заявки: параметры, контакты, файлы, смета и журнал — на одном экране. */
export function AdminRequestPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const { user } = useAuth();
  const toMessage = useErrorMessage();
  /** Не сотрудник — карточка не запрашивается вовсе, даже на кадр до редиректа. */
  const allowed = isStaff(user);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'request', id],
    queryFn: () => adminApi.request(id),
    enabled: allowed && Boolean(id),
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
      <div>
        <Link
          to="/admin"
          className="touch-target inline-flex items-center text-sm text-accent-600 underline"
        >
          {t('admin.request.back')}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {t('admin.request.title', { number: data.number })}
          </h1>
          <StatusBadge status={data.status} label={t(`request.status.${data.status}`)} />
        </div>

        {data.comment ? (
          <Alert tone="info" className="mt-4">
            {data.comment}
          </Alert>
        ) : null}

        <Section title={t('admin.request.paramsTitle')} className="mt-8">
          {data.estimate ? (
            <dl className="surface p-4">
              <DataRow
                label={t('calculator.area')}
                value={
                  <span className="tnum">
                    {data.estimate.areaSqm} {t('common.sqm')}
                  </span>
                }
              />
              <DataRow
                label={t('calculator.objectType')}
                value={t(`calculator.objectTypeOptions.${data.estimate.objectType}`)}
              />
              <DataRow
                label={t('calculator.workScope')}
                value={t(`calculator.workScopeOptions.${data.estimate.workScope}`)}
              />
              <DataRow
                label={t('calculator.finishPackage')}
                value={t(`calculator.finishPackageOptions.${data.estimate.finishPackage}`)}
              />
              <DataRow
                label={t('calculator.condition')}
                value={t(`calculator.conditionOptions.${data.estimate.condition}`)}
              />
              <DataRow
                label={t('calculator.ceilingHeight')}
                value={t(`calculator.ceilingHeightOptions.${data.estimate.ceilingHeight}`)}
              />
              <DataRow
                label={t('result.rangeLabel')}
                value={
                  data.estimate.amountMin !== null && data.estimate.amountMax !== null ? (
                    // Каждая сумма не рвётся сама по себе (`Money`), но пара
                    // «от — до» обязана переноситься: иначе на 320 px строка
                    // уезжает за правый край карточки.
                    <span className="tnum">
                      <Money value={data.estimate.amountMin} /> —{' '}
                      <Money value={data.estimate.amountMax} />
                    </span>
                  ) : (
                    <span className="text-amber-700">{t('result.designer.badge')}</span>
                  )
                }
              />
            </dl>
          ) : (
            <p className="text-sm text-ink-500">{t('request.new.noEstimate')}</p>
          )}
        </Section>

        <Section title={t('admin.request.filesTitle')} className="mt-8">
          <ul className="divide-y divide-ink-200 border-y border-ink-200">
            {data.files.length === 0 ? (
              <li className="py-2 text-sm text-ink-500">{t('request.files.empty')}</li>
            ) : null}
            {data.files.map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="user-text block text-sm">{file.originalName}</span>
                  <span className="text-xs text-ink-500">
                    {file.kind === 'BTI'
                      ? t('request.files.btiTitle')
                      : t('request.files.designTitle')}
                  </span>
                </span>
                <FileDownload fileId={file.id} />
              </li>
            ))}
          </ul>
        </Section>

        <QuoteUpload request={data} />
        <StatusChange request={data} />

        {data.decision ? (
          <Section title={t('admin.request.decisionTitle')} className="mt-8">
            <Alert tone={data.decision.result === 'ACCEPTED' ? 'success' : 'danger'}>
              <p>{t(`request.status.${data.decision.result}`)}</p>
              {data.decision.reason ? (
                <p className="mt-1">{t(`cabinet.decision.reasons.${data.decision.reason}`)}</p>
              ) : null}
              {data.decision.comment ? <p className="mt-1">{data.decision.comment}</p> : null}
            </Alert>
          </Section>
        ) : null}
      </div>

      <aside className="space-y-6">
        {data.client ? (
          <div className="surface p-4">
            <h2 className="eyebrow">{t('admin.request.clientTitle')}</h2>
            <dl className="mt-2">
              <DataRow label={t('auth.fields.fullName')} value={data.client.fullName} />
              <DataRow label={t('auth.fields.email')} value={data.client.email} />
              <DataRow
                label={t('auth.fields.phone')}
                value={<span className="tnum">{data.client.phone}</span>}
              />
              <DataRow label={t('auth.fields.address')} value={data.client.address} />
            </dl>
          </div>
        ) : null}

        <div className="surface p-4">
          <h2 className="eyebrow">{t('admin.request.logTitle')}</h2>
          <ol className="mt-3 space-y-3">
            {(data.statusLog ?? []).map((entry) => (
              <li key={entry.id} className="border-l-2 border-ink-200 pl-3 text-sm">
                <p>
                  {entry.fromStatus
                    ? t('cabinet.historyEntry', {
                        from: t(`request.status.${entry.fromStatus}`),
                        to: t(`request.status.${entry.toStatus}`),
                      })
                    : t('cabinet.historyStart')}
                </p>
                <p className="tnum text-xs text-ink-500">
                  {formatDateTime(entry.createdAt, i18n.language)}
                  {entry.actorName ? ` · ${entry.actorName}` : ''}
                </p>
                {entry.comment ? (
                  <p className="user-text mt-1 text-xs text-ink-600">{entry.comment}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </Page>
  );
}

/** Скачивание файла заявки. Отказ сервера показывается, а не теряется молча. */
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

function QuoteUpload({ request }: { request: RequestResponse }): JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toMessage = useErrorMessage();
  const [file, setFile] = useState<File | null>(null);
  const [totalAmount, setTotalAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: (payload: { file: File; totalAmount: number }) =>
      adminApi.uploadQuote(request.id, payload.file, payload.totalAmount),
    onSuccess: () => {
      setDone(true);
      setFile(null);
      setTotalAmount('');
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (caught) => setError(toMessage(caught)),
  });

  const submit = (): void => {
    setError(null);
    setDone(false);
    if (!file) {
      setError(t('admin.request.quoteFileRequired'));
      return;
    }
    const amount = Number(totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t('admin.request.quoteTotalRequired'));
      return;
    }
    mutation.mutate({ file, totalAmount: amount });
  };

  return (
    <Section title={t('admin.request.quoteTitle')} className="mt-8">
      {request.quote ? (
        <dl className="surface mb-4 p-4">
          <DataRow
            label={t('cabinet.quoteTotal')}
            value={<Money value={request.quote.totalAmount} className="font-semibold" />}
          />
        </dl>
      ) : null}

      <div className="grid max-w-md gap-4">
        <Field id="quote-file" label={t('admin.request.quoteFile')}>
          <TextInput
            id="quote-file"
            type="file"
            accept="application/pdf,.pdf"
            className="py-1.5"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </Field>
        <Field id="quote-total" label={t('admin.request.quoteTotal')}>
          <TextInput
            id="quote-total"
            type="number"
            inputMode="numeric"
            min={1}
            value={totalAmount}
            onChange={(event) => setTotalAmount(event.target.value)}
          />
        </Field>

        {error ? (
          <Alert tone="danger" title={t('errors.title')}>
            {error}
          </Alert>
        ) : null}
        {done ? <Alert tone="success">{t('admin.request.quoteUploaded')}</Alert> : null}

        <Button type="button" disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? t('common.sending') : t('admin.request.quoteSubmit')}
        </Button>
      </div>
    </Section>
  );
}

function StatusChange({ request }: { request: RequestResponse }): JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toMessage = useErrorMessage();
  const available = STAFF_TRANSITIONS[request.status];
  const [target, setTarget] = useState<RequestStatus | ''>(available[0] ?? '');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: { to: RequestStatus; comment?: string }) =>
      adminApi.changeStatus(request.id, payload),
    onSuccess: () => {
      setComment('');
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (caught) => setError(toMessage(caught)),
  });

  if (available.length === 0) {
    return (
      <Section title={t('admin.request.statusTitle')} className="mt-8">
        <p className="text-sm text-ink-500">{t('admin.request.noTransitions')}</p>
      </Section>
    );
  }

  const submit = (): void => {
    setError(null);
    if (!target) return;
    if (target === 'NEEDS_INFO' && !comment.trim()) {
      setError(t('admin.request.statusCommentRequired'));
      return;
    }
    mutation.mutate({ to: target, ...(comment.trim() ? { comment: comment.trim() } : {}) });
  };

  return (
    <Section title={t('admin.request.statusTitle')} className="mt-8">
      <div className="grid max-w-md gap-4">
        <Field id="status-target" label={t('admin.request.statusTarget')}>
          <Select
            id="status-target"
            value={target}
            onChange={(event) => setTarget(event.target.value as RequestStatus)}
          >
            {available.map((status) => (
              <option key={status} value={status}>
                {t(`request.status.${status}`)}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          id="status-comment"
          label={t('admin.request.statusComment')}
          hint={target === 'NEEDS_INFO' ? t('admin.request.statusCommentRequired') : undefined}
        >
          <TextArea
            id="status-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </Field>

        {error ? (
          <Alert tone="danger" title={t('errors.title')}>
            {error}
          </Alert>
        ) : null}

        <Button type="button" disabled={mutation.isPending} onClick={submit}>
          {t('admin.request.statusSubmit')}
        </Button>
      </div>
    </Section>
  );
}

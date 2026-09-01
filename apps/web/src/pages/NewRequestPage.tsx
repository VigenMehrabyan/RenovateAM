import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  ButtonLink,
  DataRow,
  Field,
  Page,
  PageTitle,
  Section,
  TextArea,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { FileUploadSection } from '@/features/files/FileUploadSection';
import type { UploadedItem } from '@/features/files/FileUploadSection';
import { requestsApi } from '@/lib/api';
import { clearEstimate, readEstimate } from '@/lib/estimate-storage';
import { useErrorMessage } from '@/lib/use-error-message';

/**
 * Создание заявки. Файлы не обязательны (US-3), но если они есть — заявка
 * ссылается на уже подтверждённые загрузки. Неподтверждённому e-mail вместо
 * кнопки отправки показывается баннер (US-2).
 */
export function NewRequestPage(): JSX.Element {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();

  const [bti, setBti] = useState<UploadedItem[]>([]);
  const [design, setDesign] = useState<UploadedItem[]>([]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const stored = useMemo(() => readEstimate(), []);
  const verified = user?.emailVerified === true;
  const totalCount = bti.length + design.length;
  const uploading = [...bti, ...design].some((item) => item.status === 'uploading');

  const submit = async (): Promise<void> => {
    setError(null);
    setSubmitting(true);
    try {
      const fileIds = [...bti, ...design]
        .filter((item) => item.status === 'done' && item.fileId)
        .map((item) => item.fileId as string);

      const created = await requestsApi.create({
        ...(stored?.estimateId ? { quickEstimateId: stored.estimateId } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(fileIds.length ? { fileIds } : {}),
      });
      clearEstimate();
      // Без сброса кеша кабинет ещё staleTime показывал бы список без только что
      // отправленной заявки — клиент решал бы, что отправка не прошла.
      await queryClient.invalidateQueries({ queryKey: ['requests'] });
      navigate(`/cabinet?request=${created.id}`, { replace: true });
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Page className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div>
        <PageTitle>{t('request.new.title')}</PageTitle>
        <p className="mt-2 max-w-prose text-sm text-ink-600">{t('request.new.lead')}</p>

        {!verified ? (
          <Alert tone="warning" className="mt-5" title={t('auth.verify.bannerTitle')}>
            <p>{t('auth.verify.bannerText')}</p>
            <ButtonLink to="/verify" variant="secondary" className="mt-3">
              {t('auth.verify.bannerAction')}
            </ButtonLink>
          </Alert>
        ) : null}

        <div className="mt-8 grid gap-8">
          <FileUploadSection
            kind="BTI"
            title={t('request.files.btiTitle')}
            hint={t('request.files.btiHint')}
            items={bti}
            onItemsChange={setBti}
            totalCount={totalCount}
            disabled={!verified}
          />
          <FileUploadSection
            kind="DESIGN"
            title={t('request.files.designTitle')}
            hint={t('request.files.designHint')}
            items={design}
            onItemsChange={setDesign}
            totalCount={totalCount}
            disabled={!verified}
          />
        </div>

        <Section className="mt-8">
          <Field
            id="comment"
            label={t('request.new.commentLabel')}
            hint={t('request.new.commentHint')}
          >
            <TextArea
              id="comment"
              maxLength={2000}
              placeholder={t('request.new.commentPlaceholder')}
              value={comment}
              aria-describedby="comment-hint"
              onChange={(event) => setComment(event.target.value)}
            />
          </Field>
        </Section>

        {error ? (
          <Alert tone="danger" className="mt-5" title={t('errors.title')}>
            {error}
          </Alert>
        ) : null}

        {verified ? (
          <Button
            type="button"
            className="mt-6"
            disabled={submitting || uploading}
            onClick={() => void submit()}
          >
            {submitting ? t('common.sending') : t('request.new.submit')}
          </Button>
        ) : null}
      </div>

      <aside>
        <div className="surface p-5">
          <h2 className="eyebrow">{t('request.new.estimateTitle')}</h2>
          {stored ? (
            <dl className="mt-2">
              <DataRow
                label={t('calculator.area')}
                value={
                  <span className="tnum">
                    {stored.input.areaSqm} {t('common.sqm')}
                  </span>
                }
              />
              <DataRow
                label={t('calculator.objectType')}
                value={t(`calculator.objectTypeOptions.${stored.input.objectType}`)}
              />
              <DataRow
                label={t('calculator.workScope')}
                value={t(`calculator.workScopeOptions.${stored.input.workScope}`)}
              />
              <DataRow
                label={t('calculator.finishPackage')}
                value={t(`calculator.finishPackageOptions.${stored.input.finishPackage}`)}
              />
            </dl>
          ) : (
            <p className="mt-2 text-sm text-ink-500">{t('request.new.noEstimate')}</p>
          )}
        </div>
      </aside>
    </Page>
  );
}

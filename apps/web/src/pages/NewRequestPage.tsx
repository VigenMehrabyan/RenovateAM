import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  TextInput,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { FileUploadSection } from '@/features/files/FileUploadSection';
import type { UploadedItem } from '@/features/files/FileUploadSection';
import { authApi, pricingApi, requestsApi } from '@/lib/api';
import { attachEstimateId, clearEstimate, readEstimate } from '@/lib/estimate-storage';
import { isLocale, toApiLocale } from '@/i18n';
import { useErrorMessage } from '@/lib/use-error-message';
import { requestAddressSchema } from '@/lib/validation';

/**
 * Создание заявки. Файлы не обязательны (US-3), но если они есть — заявка
 * ссылается на уже подтверждённые загрузки. Неподтверждённому e-mail вместо
 * кнопки отправки показывается баннер (US-2).
 *
 * Адрес объекта спрашивается здесь, а не берётся из профиля: заявок у клиента
 * может быть несколько, и объект у каждой свой. Контактный адрес из профиля
 * подставляется как значение по умолчанию — чаще всего он и есть нужный.
 */
export function NewRequestPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();

  const [bti, setBti] = useState<UploadedItem[]>([]);
  const [design, setDesign] = useState<UploadedItem[]>([]);
  const [comment, setComment] = useState('');
  const [address, setAddress] = useState('');
  const [addressTouched, setAddressTouched] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const stored = useMemo(() => readEstimate(), []);
  const verified = user?.emailVerified === true;

  /** Профиль нужен только ради контактного адреса; без пользователя не запрашивается. */
  const profile = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => authApi.me(),
    enabled: Boolean(user),
  });

  // Подстановка контактного адреса — один раз и только пока поле не трогали:
  // поздний ответ профиля не должен затирать то, что клиент уже напечатал.
  const contactAddress = profile.data?.address;
  useEffect(() => {
    if (addressTouched || !contactAddress) return;
    setAddress(contactAddress);
  }, [contactAddress, addressTouched]);
  const totalCount = bti.length + design.length;
  const uploading = [...bti, ...design].some((item) => item.status === 'uploading');

  const submit = async (): Promise<void> => {
    if (submitting || uploading || !verified) return;
    const validAddress = requestAddressSchema.safeParse(address);
    if (!validAddress.success) {
      setAddressError(
        t(validAddress.error.issues[0]?.message ?? 'auth.validation.addressRequired'),
      );
      return;
    }
    setAddressError(null);
    setError(null);
    setSubmitting(true);
    try {
      const fileIds = [...bti, ...design]
        .filter((item) => item.status === 'done' && item.fileId)
        .map((item) => item.fileId as string);

      // Read again: background saving can finish after this page mounted.
      // If it failed, persist the inputs before creating a request; never silently drop them.
      const current = readEstimate();
      let estimateId = current?.estimateId;
      if (current && !estimateId) {
        const saved = await pricingApi.estimate({
          ...current.input,
          locale: toApiLocale(isLocale(i18n.language) ? i18n.language : 'ru'),
        });
        estimateId = saved.id;
        if (current.token) attachEstimateId(current.token, saved.id);
      }
      const created = await requestsApi.create({
        address: validAddress.data,
        ...(estimateId ? { quickEstimateId: estimateId } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(fileIds.length ? { fileIds } : {}),
      });
      clearEstimate();
      // Без сброса кеша кабинет ещё staleTime показывал бы список без только что
      // отправленной заявки — клиент решал бы, что отправка не прошла.
      await queryClient.invalidateQueries({ queryKey: ['requests'] });
      navigate(`/cabinet/requests/${created.id}`, { replace: true });
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

        <Section className="mt-8">
          <Field
            id="address"
            label={t('request.new.addressLabel')}
            hint={t('request.new.addressHint')}
            error={addressError ?? undefined}
          >
            <TextInput
              id="address"
              autoComplete="street-address"
              maxLength={500}
              value={address}
              aria-invalid={Boolean(addressError)}
              aria-describedby={addressError ? 'address-error' : 'address-hint'}
              onChange={(event) => {
                setAddressTouched(true);
                setAddress(event.target.value);
              }}
            />
          </Field>
        </Section>

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

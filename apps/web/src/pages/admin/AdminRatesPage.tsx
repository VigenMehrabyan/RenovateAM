import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Field, Section, Spinner, TextInput } from '@/components/ui';
import { RATES_QUERY_KEY, useRates } from '@/features/pricing/use-rates';
import { adminApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';

/** Ключи ставок в плоском виде, как они лежат в `pricing_rates`. */
const RATE_FIELDS = [
  { key: 'base_rate_amd', group: 'baseRate', step: 1000 },
  { key: 'scope_turnkey', group: 'workScope', step: 0.01 },
  { key: 'scope_finishing', group: 'workScope', step: 0.01 },
  { key: 'scope_rough', group: 'workScope', step: 0.01 },
  { key: 'object_apartment', group: 'objectType', step: 0.01 },
  { key: 'object_house', group: 'objectType', step: 0.01 },
  { key: 'condition_new', group: 'condition', step: 0.01 },
  { key: 'condition_secondary', group: 'condition', step: 0.01 },
  { key: 'ceiling_up_to_3m', group: 'ceilingHeight', step: 0.01 },
  { key: 'ceiling_from_3m', group: 'ceilingHeight', step: 0.01 },
  { key: 'range_min', group: 'range', step: 0.01 },
  { key: 'range_max', group: 'range', step: 0.01 },
] as const;

const FIELD_LABELS: Readonly<Record<string, string>> = {
  base_rate_amd: 'admin.rates.baseRate',
  scope_turnkey: 'calculator.workScopeOptions.TURNKEY',
  scope_finishing: 'calculator.workScopeOptions.FINISHING',
  scope_rough: 'calculator.workScopeOptions.ROUGH',
  object_apartment: 'calculator.objectTypeOptions.APARTMENT',
  object_house: 'calculator.objectTypeOptions.HOUSE',
  condition_new: 'calculator.conditionOptions.NEW_BUILDING',
  condition_secondary: 'calculator.conditionOptions.SECONDARY_WITH_DEMOLITION',
  ceiling_up_to_3m: 'calculator.ceilingHeightOptions.UP_TO_3M',
  ceiling_from_3m: 'calculator.ceilingHeightOptions.FROM_3M',
  range_min: 'admin.rates.rangeMin',
  range_max: 'admin.rates.rangeMax',
};

const GROUP_TITLES: Readonly<Record<string, string>> = {
  baseRate: 'admin.rates.baseRate',
  workScope: 'admin.rates.workScope',
  objectType: 'admin.rates.objectType',
  condition: 'admin.rates.condition',
  ceilingHeight: 'admin.rates.ceilingHeight',
  range: 'admin.rates.range',
};

/**
 * Редактор ставок. Сохранение создаёт новую версию набора — прошлые расчёты
 * остаются на своей версии (US-7).
 */
export function AdminRatesPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const toMessage = useErrorMessage();
  const { rates } = useRates();

  const versions = useQuery({
    queryKey: ['admin', 'rate-versions'],
    queryFn: () => adminApi.rateVersions(),
  });

  const [values, setValues] = useState<Record<string, string>>(() => ({
    base_rate_amd: String(rates.baseRateAmd),
    scope_turnkey: String(rates.workScope.TURNKEY),
    scope_finishing: String(rates.workScope.FINISHING),
    scope_rough: String(rates.workScope.ROUGH),
    object_apartment: String(rates.objectType.APARTMENT),
    object_house: String(rates.objectType.HOUSE),
    condition_new: String(rates.condition.NEW_BUILDING),
    condition_secondary: String(rates.condition.SECONDARY_WITH_DEMOLITION),
    ceiling_up_to_3m: String(rates.ceilingHeight.UP_TO_3M),
    ceiling_from_3m: String(rates.ceilingHeight.FROM_3M),
    range_min: String(rates.rangeMin),
    range_max: String(rates.rangeMax),
  }));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: (payload: { rates: Record<string, number>; note?: string }) =>
      adminApi.updateRates(payload),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: RATES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'rate-versions'] });
    },
    onError: (caught) => setError(toMessage(caught)),
  });

  const submit = (): void => {
    setError(null);
    setSaved(false);
    const parsed: Record<string, number> = {};
    const nextFieldErrors: Record<string, string> = {};

    for (const field of RATE_FIELDS) {
      const value = Number(values[field.key]);
      if (!Number.isFinite(value) || value <= 0) {
        nextFieldErrors[field.key] = t('admin.rates.positiveRequired');
        continue;
      }
      parsed[field.key] = value;
    }

    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    mutation.mutate({ rates: parsed, ...(note.trim() ? { note: note.trim() } : {}) });
  };

  const groups = [...new Set(RATE_FIELDS.map((field) => field.group))];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div>
        <h1 className="text-2xl font-semibold">{t('admin.rates.title')}</h1>
        <p className="mt-2 max-w-prose text-sm text-ink-600">{t('admin.rates.lead')}</p>

        {groups.map((group) => (
          <Section
            key={group}
            // У базовой ставки заголовок группы совпал бы с подписью поля.
            {...(group === 'baseRate' ? {} : { title: t(GROUP_TITLES[group] ?? group) })}
            className="mt-8"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {RATE_FIELDS.filter((field) => field.group === group).map((field) => (
                <Field
                  key={field.key}
                  id={field.key}
                  label={t(FIELD_LABELS[field.key] ?? field.key)}
                  error={fieldErrors[field.key]}
                >
                  <TextInput
                    id={field.key}
                    type="number"
                    inputMode="decimal"
                    step={field.step}
                    min={0}
                    className="tnum"
                    aria-invalid={Boolean(fieldErrors[field.key])}
                    aria-describedby={fieldErrors[field.key] ? `${field.key}-error` : undefined}
                    value={values[field.key] ?? ''}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.key]: event.target.value }))
                    }
                  />
                </Field>
              ))}
            </div>
          </Section>
        ))}

        <Section className="mt-8">
          <Field id="rates-note" label={t('admin.rates.note')}>
            <TextInput
              id="rates-note"
              placeholder={t('admin.rates.notePlaceholder')}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </Section>

        {error ? (
          <Alert tone="danger" className="mt-5" title={t('errors.title')}>
            {error}
          </Alert>
        ) : null}
        {saved ? (
          <Alert tone="success" className="mt-5">
            {t('admin.rates.saved')}
          </Alert>
        ) : null}

        <Button type="button" className="mt-6" disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? t('common.saving') : t('admin.rates.submit')}
        </Button>
      </div>

      <aside>
        <div className="surface rounded-lg p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-600">
            {t('admin.rates.historyTitle')}
          </h2>
          {versions.isLoading ? <Spinner label={t('common.loading')} /> : null}
          <ol className="mt-3 space-y-3">
            {(versions.data?.items ?? []).map((version) => (
              <li key={version.id} className="border-l-2 border-ink-200 pl-3 text-sm">
                <p className="tnum text-xs text-ink-500">
                  {formatDateTime(version.createdAt, i18n.language)}
                </p>
                {version.isActive ? (
                  <p className="text-xs font-medium text-success-500">
                    {t('admin.rates.activeVersion')}
                  </p>
                ) : null}
                {version.createdBy ? (
                  <p className="text-xs text-ink-600">
                    {t('admin.rates.author')}: {version.createdBy.fullName}
                  </p>
                ) : null}
                {version.note ? <p className="mt-1 text-xs text-ink-600">{version.note}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}

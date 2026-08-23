import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { calculateEstimate, EstimateValidationError } from '@renovateam/pricing-core';
import type { AutomaticEstimateResult, EstimateResult } from '@renovateam/pricing-core';
import { Alert, ButtonLink, DataRow, Money, Spinner } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useRates } from '@/features/pricing/use-rates';
import { readEstimate } from '@/lib/estimate-storage';
import { formatCoefficient, formatDate } from '@/lib/format';
import type { CalculatorValues } from '@/lib/validation';

/**
 * Экран результата.
 *
 * Дизайнерский пакет физически не может показать сумму: `EstimateResult` —
 * размеченное объединение, и ветка `needsManualReview: true` не содержит полей
 * с суммами вообще. Разметка с суммами живёт в отдельном компоненте, который
 * принимает `AutomaticEstimateResult`, — попытка отрисовать её для
 * дизайнерского пакета не проходит проверку типов.
 */
export function EstimatePage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { rates, validityDays, isLoading } = useRates();
  const stored = useMemo(() => readEstimate(), []);

  // Сумму нельзя показать по ставкам «по умолчанию», а через мгновение
  // заменить её другой: изменившаяся на глазах цена дороже секунды ожидания.
  // Если ставки не пришли вовсе (сеть) — считаем по умолчанию, как задумано.
  if (isLoading) {
    return (
      <div className="max-w-prose">
        <h1 className="text-2xl font-semibold">{t('result.title')}</h1>
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  if (!stored) {
    return (
      <div className="max-w-prose">
        <h1 className="text-2xl font-semibold">{t('result.title')}</h1>
        <p className="mt-3 text-ink-600">{t('result.empty')}</p>
        <ButtonLink to="/" className="mt-5">
          {t('result.toCalculator')}
        </ButtonLink>
      </div>
    );
  }

  let result: EstimateResult;
  try {
    result = calculateEstimate(stored.input, rates);
  } catch (error) {
    const code = error instanceof EstimateValidationError ? error.code : 'AREA_OUT_OF_RANGE';
    return (
      <div className="max-w-prose">
        <h1 className="text-2xl font-semibold">{t('result.title')}</h1>
        <Alert tone="danger" className="mt-4" title={t('errors.title')}>
          {code === 'AREA_NOT_A_NUMBER'
            ? t('calculator.validation.areaNumber')
            : t('errors.AREA_OUT_OF_RANGE')}
        </Alert>
        <ButtonLink to="/" variant="secondary" className="mt-5">
          {t('result.recalculate')}
        </ButtonLink>
      </div>
    );
  }

  const validUntil = new Date(stored.calculatedAt);
  validUntil.setDate(validUntil.getDate() + validityDays);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">{t('result.title')}</h1>

        {result.needsManualReview ? (
          <ManualReviewPanel />
        ) : (
          <>
            <AutomaticPanel result={result} validUntil={validUntil} locale={i18n.language} />
            {/* Состав пакета показываем только там, где он и применяется. */}
            <PackageContents />
          </>
        )}
      </div>

      <aside className="lg:pt-14">
        <ParametersCard input={stored.input} result={result} />
      </aside>
    </div>
  );
}

/** Панель с ценой. Принимает только «автоматический» результат — по типу. */
function AutomaticPanel({
  result,
  validUntil,
  locale,
}: {
  result: AutomaticEstimateResult;
  validUntil: Date;
  locale: string;
}): JSX.Element {
  const { t } = useTranslation();

  return (
    <section className="mt-5 border-l-4 border-accent-500 bg-white p-4 sm:p-6" aria-live="polite">
      <p className="text-sm text-ink-600">{t('result.rangeLabel')}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span className="inline-flex items-baseline gap-2">
          <span className="text-sm text-ink-500">{t('result.from')}</span>
          <Money value={result.amountMin} className="text-2xl font-semibold sm:text-4xl" />
        </span>
        <span className="inline-flex items-baseline gap-2">
          <span className="text-sm text-ink-500">{t('result.to')}</span>
          <Money value={result.amountMax} className="text-2xl font-semibold sm:text-4xl" />
        </span>
      </p>
      <p className="mt-4 text-sm text-ink-600">
        {t('result.validUntil', { date: formatDate(validUntil, locale) })}
      </p>
      <p className="mt-1 text-sm text-ink-500">{t('result.validityNote')}</p>
      <p className="mt-3 border-t border-ink-200 pt-3 text-sm font-medium text-ink-700">
        {t('result.disclaimer')}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <RequestCta />
        <ButtonLink to="/" variant="secondary">
          {t('result.recalculate')}
        </ButtonLink>
      </div>
    </section>
  );
}

/** Панель дизайнерского пакета. Ни одного числового поля — их неоткуда взять. */
function ManualReviewPanel(): JSX.Element {
  const { t } = useTranslation();

  return (
    <section className="mt-5 border-l-4 border-amber-500 bg-amber-50 p-4 sm:p-6" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
        {t('result.designer.badge')}
      </p>
      <h2 className="mt-2 text-xl font-semibold text-ink-900">{t('result.designer.title')}</h2>
      <p className="mt-2 max-w-prose text-sm text-ink-700">{t('result.designer.text')}</p>
      <p className="mt-2 max-w-prose text-sm text-ink-600">{t('result.designer.noPriceNote')}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <RequestCta />
        <ButtonLink to="/" variant="secondary">
          {t('result.recalculate')}
        </ButtonLink>
      </div>
    </section>
  );
}

function RequestCta(): JSX.Element {
  const { t } = useTranslation();
  const { user } = useAuth();
  return <ButtonLink to={user ? '/requests/new' : '/register'}>{t('result.toRequest')}</ButtonLink>;
}

function PackageContents(): JSX.Element {
  const { t } = useTranslation();
  const items = t('landing.packageItems', { returnObjects: true }) as string[];

  return (
    <section className="mt-8" aria-labelledby="result-package">
      <h2 className="text-lg font-semibold" id="result-package">
        {t('result.includedTitle')}
      </h2>
      <ul className="mt-3 divide-y divide-ink-200 border-y border-ink-200">
        {items.map((item) => (
          <li key={item} className="py-2 text-sm text-ink-700">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ParametersCard({
  input,
  result,
}: {
  input: CalculatorValues;
  result: EstimateResult;
}): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="surface rounded-lg p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-600">
        {t('result.parametersTitle')}
      </h2>
      <dl className="mt-2">
        <DataRow
          label={t('calculator.area')}
          value={
            <span className="tnum">
              {input.areaSqm} {t('common.sqm')}
            </span>
          }
        />
        <DataRow
          label={t('calculator.objectType')}
          value={t(`calculator.objectTypeOptions.${input.objectType}`)}
        />
        <DataRow
          label={t('calculator.workScope')}
          value={t(`calculator.workScopeOptions.${input.workScope}`)}
        />
        <DataRow
          label={t('calculator.finishPackage')}
          value={t(`calculator.finishPackageOptions.${input.finishPackage}`)}
        />
        <DataRow
          label={t('calculator.condition')}
          value={t(`calculator.conditionOptions.${input.condition}`)}
        />
        <DataRow
          label={t('calculator.ceilingHeight')}
          value={t(`calculator.ceilingHeightOptions.${input.ceilingHeight}`)}
        />
      </dl>

      {result.needsManualReview ? null : (
        <>
          <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-ink-600">
            {t('result.coefficientsTitle')}
          </h3>
          <dl className="mt-2">
            <DataRow
              label={t('calculator.workScope')}
              value={<span className="tnum">{formatCoefficient(result.applied.workScope)}</span>}
            />
            <DataRow
              label={t('calculator.objectType')}
              value={<span className="tnum">{formatCoefficient(result.applied.objectType)}</span>}
            />
            <DataRow
              label={t('calculator.condition')}
              value={<span className="tnum">{formatCoefficient(result.applied.condition)}</span>}
            />
            <DataRow
              label={t('calculator.ceilingHeight')}
              value={
                <span className="tnum">{formatCoefficient(result.applied.ceilingHeight)}</span>
              }
            />
          </dl>
        </>
      )}
    </div>
  );
}

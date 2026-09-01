import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { calculateEstimate, EstimateValidationError } from '@renovateam/pricing-core';
import type { AutomaticEstimateResult, EstimateResult } from '@renovateam/pricing-core';
import { Alert, ButtonLink, DataRow, Money, Page, PageTitle, Spinner } from '@/components/ui';
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
      <Page width="prose">
        <PageTitle>{t('result.title')}</PageTitle>
        <Spinner label={t('common.loading')} />
      </Page>
    );
  }

  if (!stored) {
    return (
      <Page width="prose">
        <PageTitle>{t('result.title')}</PageTitle>
        <p className="mt-3 text-ink-600">{t('result.empty')}</p>
        <ButtonLink to="/" className="mt-5">
          {t('result.toCalculator')}
        </ButtonLink>
      </Page>
    );
  }

  let result: EstimateResult;
  try {
    result = calculateEstimate(stored.input, rates);
  } catch (error) {
    const code = error instanceof EstimateValidationError ? error.code : 'AREA_OUT_OF_RANGE';
    return (
      <Page width="prose">
        <PageTitle>{t('result.title')}</PageTitle>
        <Alert tone="danger" className="mt-4" title={t('errors.title')}>
          {code === 'AREA_NOT_A_NUMBER'
            ? t('calculator.validation.areaNumber')
            : t('errors.AREA_OUT_OF_RANGE')}
        </Alert>
        <ButtonLink to="/" variant="secondary" className="mt-5">
          {t('result.recalculate')}
        </ButtonLink>
      </Page>
    );
  }

  const validUntil = new Date(stored.calculatedAt);
  validUntil.setDate(validUntil.getDate() + validityDays);

  return (
    <Page className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div>
        <PageTitle>{t('result.title')}</PageTitle>

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

      <aside className="lg:pt-16">
        <ParametersCard input={stored.input} result={result} />
      </aside>
    </Page>
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
    <section
      className="mt-6 border border-ink-200 border-l-[3px] border-l-gold-500 bg-white p-5 sm:p-7"
      aria-live="polite"
    >
      <p className="eyebrow">{t('result.rangeLabel')}</p>
      {/* Пара «подпись + сумма» переносится внутри себя (`flex-wrap`): сама
          сумма не рвётся никогда (`Money`), но связка «մինչև 104 868 960 ֏»
          на hy задавала карточке min-content 309 px — на 320 px страница
          уезжала вправо, а `overflow-x: hidden` на body это прятало. */}
      <p className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span className="inline-flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm text-ink-500">{t('result.from')}</span>
          <Money value={result.amountMin} className="text-2xl font-semibold sm:text-4xl" />
        </span>
        <span className="inline-flex flex-wrap items-baseline gap-x-2">
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
    <section
      className="mt-6 border border-amber-100 border-l-[3px] border-l-amber-500 bg-amber-50 p-5 sm:p-7"
      aria-live="polite"
    >
      <p className="text-xs font-medium uppercase tracking-brand text-amber-700">
        {t('result.designer.badge')}
      </p>
      <h2 className="display mt-3 text-2xl sm:text-3xl">{t('result.designer.title')}</h2>
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
    <section className="mt-10" aria-labelledby="result-package">
      <h2 className="display text-2xl" id="result-package">
        {t('result.includedTitle')}
      </h2>
      <ul className="mt-4 divide-y divide-ink-200 border-y border-ink-200">
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
    <div className="surface p-5">
      <h2 className="eyebrow">{t('result.parametersTitle')}</h2>
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
          <h3 className="eyebrow mt-6">{t('result.coefficientsTitle')}</h3>
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

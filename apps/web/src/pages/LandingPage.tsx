import { useTranslation } from 'react-i18next';
import { CalculatorForm } from '@/features/pricing/CalculatorForm';
import { useRates } from '@/features/pricing/use-rates';
import { formatAmd } from '@/lib/format';

/**
 * Лендинг.
 *
 * Порядок на мобильной ширине: короткий заголовок и одна строка объяснения
 * («что это и почему этому можно верить») — и сразу под ними калькулятор,
 * который остаётся в первом экране. Развёрнутые объяснения идут ниже формы:
 * их читают те, кому расчёта оказалось мало.
 *
 * На lg заголовок и объяснения собираются в левую колонку (строки 1 и 2),
 * калькулятор занимает правую и не уезжает вниз.
 */
export function LandingPage(): JSX.Element {
  const { t } = useTranslation();
  const { rates } = useRates();

  const steps = t('landing.steps', { returnObjects: true }) as Array<{
    title: string;
    text: string;
  }>;
  const packageItems = t('landing.packageItems', { returnObjects: true }) as string[];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-x-12 lg:gap-y-10">
      <header className="lg:col-start-1 lg:row-start-1">
        <p className="text-xs uppercase tracking-[0.14em] text-accent-600">
          {t('landing.eyebrow')}
        </p>
        <h1 className="mt-1 text-xl font-semibold leading-tight sm:text-3xl lg:text-4xl">
          {t('landing.title')}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-ink-600 sm:text-base">{t('landing.lead')}</p>
      </header>

      <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
        <div className="surface rounded-lg p-4 sm:p-6">
          <h2 className="text-lg font-semibold">{t('calculator.title')}</h2>
          <p className="mt-1 text-sm text-ink-600">{t('calculator.subtitle')}</p>
          <div className="mt-5">
            <CalculatorForm />
          </div>
        </div>
      </div>

      <div className="lg:col-start-1 lg:row-start-2">
        <dl className="border-l-2 border-accent-500 pl-4">
          <dt className="text-sm text-ink-600">{t('landing.baseRateLabel')}</dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="tnum text-xl font-semibold text-ink-900">
              {formatAmd(rates.baseRateAmd)}
            </span>
            <span className="text-sm text-ink-500">{t('landing.baseRateUnit')}</span>
          </dd>
        </dl>

        <section className="mt-10" aria-labelledby="how-it-works">
          <h2 className="text-lg font-semibold" id="how-it-works">
            {t('landing.howTitle')}
          </h2>
          <ol className="mt-4 space-y-4">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink-300 text-xs font-medium text-ink-600">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{step.title}</h3>
                  <p className="mt-0.5 max-w-prose text-sm text-ink-600">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10" aria-labelledby="package-contents">
          <h2 className="text-lg font-semibold" id="package-contents">
            {t('landing.packageTitle')}
          </h2>
          <ul className="mt-4 divide-y divide-ink-200 border-y border-ink-200">
            {packageItems.map((item) => (
              <li key={item} className="py-2 text-sm text-ink-700">
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-prose text-sm text-ink-500">{t('landing.packageNote')}</p>
        </section>
      </div>
    </div>
  );
}

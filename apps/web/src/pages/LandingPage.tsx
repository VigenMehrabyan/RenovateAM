import { useTranslation } from 'react-i18next';
import { calculateEstimate } from '@renovateam/pricing-core';
import type { RateSet, WorkScope } from '@renovateam/pricing-core';
import { DimensionLine } from '@/components/brand';
import { Icon } from '@/components/Icon';
import { ButtonLink, buttonClass } from '@/components/ui';
import { CalculatorForm } from '@/features/pricing/CalculatorForm';
import { useRates } from '@/features/pricing/use-rates';
import { formatAmd, formatNumber } from '@/lib/format';
import { useCountUp, useRevealRef, useSeen } from '@/lib/use-reveal';

/**
 * Лендинг.
 *
 * Композиция: тёмная плоскость героя с калькулятором поверх неё → плотный
 * блок из четырёх утверждений → этапы 01–04 на светлой подложке → сетка
 * пакетов 3+1 → состав стандартного пакета → вопросы и ответы. Плотные и
 * воздушные секции чередуются.
 *
 * На мобильной калькулятор идёт сразу под заголовком и строкой срока,
 * на lg занимает правую колонку героя.
 *
 * Ни одна анимация не задерживает появление текста: начальные состояния живут
 * за классом `motion`, который ставится только из скрипта и только когда
 * пользователь не просил уменьшить движение.
 */
export function LandingPage(): JSX.Element {
  const { t } = useTranslation();
  const { rates } = useRates();

  return (
    <>
      <Hero />
      <Claims />
      <Steps />
      <Packages rates={rates} />
      <PackageContents />
      <Faq />
      {/* Ссылка «наверх, к расчёту» — единственный призыв в конце страницы. */}
      <section className="border-t border-ink-200 bg-ink-100">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10">
          <p className="display text-2xl sm:text-3xl">{t('landing.closingTitle')}</p>
          {/* Якорь внутри страницы — обычная ссылка, а не переход маршрутизатора. */}
          <a href="#calculator" className={buttonClass()}>
            {t('landing.closingCta')}
          </a>
        </div>
      </section>
    </>
  );
}

/* ---------------------------------- Герой ---------------------------------- */

function Hero(): JSX.Element {
  const { t } = useTranslation();

  return (
    <section className="hero on-dark text-ink-50">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-x-14 lg:py-16">
        <div className="hero-copy">
          <div className="flex items-center gap-3">
            <p className="hero-eyebrow">{t('landing.eyebrow')}</p>
          </div>

          <h1 className="display hero-title mt-6 text-ink-50">{t('landing.title')}</h1>

          <p className="mt-5 max-w-prose text-base text-ink-200/90 sm:text-lg">
            {t('landing.lead')}
          </p>

          <p className="hero-status mt-6 inline-flex items-center gap-3 px-4 py-3 text-sm text-ink-100">
            <Icon name="clock" />
            {t('landing.heroStatus')}
          </p>
        </div>

        {/* Светлая стеклянная карточка отделяет расчёт от тёмного фона. */}
        <div className="min-w-0">
          <div id="calculator" className="calculator-glass p-5 text-ink-800 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <h2 className="display text-3xl">{t('calculator.title')}</h2>
              <span className="icon-tile">
                <Icon name="calculator" />
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-600">{t('calculator.subtitle')}</p>
            <div className="mt-5">
              <CalculatorForm />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------- Четыре коротких утверждения ---------------------- */

function Claims(): JSX.Element {
  const { t } = useTranslation();
  const claims = t('landing.claims', { returnObjects: true }) as Array<{
    title: string;
    text: string;
  }>;

  return (
    <section className="bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {claims.map((claim, index) => (
            <li key={claim.title} className="claim-card p-5">
              <span className="icon-tile mb-4">
                <Icon
                  name={(['calculator', 'shield', 'clock', 'file'] as const)[index] ?? 'check'}
                />
              </span>
              <h2 className="text-base font-semibold text-ink-900">{claim.title}</h2>
              <p className="mt-2 text-sm text-ink-600">{claim.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* --------------------------------- Этапы ----------------------------------- */

function Steps(): JSX.Element {
  const { t } = useTranslation();
  const revealLine = useRevealRef<SVGLineElement>();
  const steps = t('landing.steps', { returnObjects: true }) as Array<{
    title: string;
    text: string;
  }>;

  return (
    <section className="border-y border-ink-200 bg-ink-100" aria-labelledby="how-it-works">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:py-20">
        <p className="eyebrow">{t('landing.stepsEyebrow')}</p>
        <h2 className="display mt-3 text-3xl sm:text-4xl" id="how-it-works">
          {t('landing.howTitle')}
        </h2>

        {/* Размерная линия чертежа: прочерчивается при появлении секции. */}
        <DimensionLine className="mt-6 h-3 w-full text-ink-400" revealRef={revealLine} />

        <ol className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <Step key={step.title} index={index} title={step.title} text={step.text} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function Step({ index, title, text }: { index: number; title: string; text: string }): JSX.Element {
  const reveal = useRevealRef<HTMLLIElement>();

  return (
    <li
      ref={reveal}
      data-reveal
      style={{ ['--reveal-delay' as string]: `${index * 90}ms` }}
      className="step-card grid content-start gap-5 p-5"
    >
      <span className="tnum display text-4xl leading-none text-accent-400">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div>
        <h3 className="text-base font-semibold text-ink-900">{title}</h3>
        <p className="mt-1 max-w-prose text-sm text-ink-600">{text}</p>
      </div>
    </li>
  );
}

/* -------------------------------- Пакеты 3+1 -------------------------------- */

const PACKAGE_SCOPES: readonly WorkScope[] = ['ROUGH', 'FINISHING', 'TURNKEY'];

/**
 * Ставка за м² для пакета. Считается тем же движком, что и сама оценка:
 * берётся минимально допустимая площадь и делится обратно. Формула нигде
 * не дублируется — источник истины остаётся один.
 */
function ratePerSqm(scope: WorkScope, rates: RateSet): number {
  const result = calculateEstimate(
    {
      areaSqm: 10,
      objectType: 'APARTMENT',
      workScope: scope,
      finishPackage: 'STANDARD',
      condition: 'NEW_BUILDING',
      ceilingHeight: 'UP_TO_3M',
    },
    rates,
  );
  // Стандартный пакет считается всегда; ветка нужна только для сужения типа.
  return result.needsManualReview ? 0 : Math.round(result.amountBase / 10);
}

function Packages({ rates }: { rates: RateSet }): JSX.Element {
  const { t } = useTranslation();

  return (
    <section className="bg-white" aria-labelledby="packages-title">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:py-20" id="packages">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{t('landing.packagesEyebrow')}</p>
            <h2 className="display mt-3 text-3xl sm:text-4xl" id="packages-title">
              {t('landing.packagesTitle')}
            </h2>
          </div>
          <dl className="border-l-2 border-accent-300 pl-4">
            <dt className="text-sm text-ink-600">{t('landing.baseRateLabel')}</dt>
            <dd className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="tnum text-xl font-semibold text-ink-900">
                {formatAmd(rates.baseRateAmd)}
              </span>
              <span className="text-sm text-ink-500">{t('landing.baseRateUnit')}</span>
            </dd>
          </dl>
        </div>

        <p className="mt-4 max-w-prose text-sm text-ink-600">{t('landing.packagesLead')}</p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PACKAGE_SCOPES.map((scope) => (
            <PackageCard key={scope} scope={scope} rate={ratePerSqm(scope, rates)} />
          ))}
          <DesignerCard />
        </div>
      </div>
    </section>
  );
}

function PackageCard({ scope, rate }: { scope: WorkScope; rate: number }): JSX.Element {
  const { t } = useTranslation();
  const [seenRef, seen] = useSeen<HTMLDivElement>();
  // Счётчик — только для справочной ставки за м². Вилка клиента никогда
  // не «набегает»: цену, которую читают, нельзя показывать в движении.
  const shown = useCountUp(rate, seen);

  return (
    <div ref={seenRef} className="lift-card flex flex-col p-6">
      <h3 className="display text-2xl">{t(`calculator.workScopeOptions.${scope}`)}</h3>
      <p className="mt-2 flex-1 text-sm text-ink-600">{t(`landing.packages.${scope}`)}</p>
      <p className="mt-5 border-t border-ink-200 pt-4">
        <span className="tnum block text-2xl font-semibold text-ink-900">
          {formatNumber(shown)} {t('common.amdSuffix')}
        </span>
        <span className="mt-1 block text-sm text-ink-500">{t('landing.baseRateUnit')}</span>
      </p>
    </div>
  );
}

/**
 * Четвёртая карточка — дизайнерский проект. Цены нет и быть не может:
 * `calculateEstimate` для этого пакета возвращает результат без единого
 * числового поля, а здесь расчёт не вызывается вовсе.
 */
function DesignerCard(): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="designer-card on-dark flex flex-col bg-ink-900 p-6 text-ink-50">
      <p className="eyebrow-light">{t('landing.designerCard.badge')}</p>
      <h3 className="display mt-3 text-2xl text-ink-50">{t('landing.designerCard.title')}</h3>
      <p className="mt-2 flex-1 text-sm text-ink-200/90">{t('landing.designerCard.text')}</p>
      <div className="mt-5 border-t border-ink-700 pt-4">
        <p className="text-sm text-ink-200/90">{t('landing.designerCard.noPrice')}</p>
        <ButtonLink
          to="/?finishPackage=DESIGNER#calculator"
          variant="onDark"
          className="mt-4 w-full"
        >
          {t('landing.designerCard.cta')}
        </ButtonLink>
      </div>
    </div>
  );
}

/* --------------------- Что входит в стандартный пакет ----------------------- */

function PackageContents(): JSX.Element {
  const { t } = useTranslation();
  const items = t('landing.packageItems', { returnObjects: true }) as string[];

  return (
    <section className="border-y border-ink-200 bg-ink-100" aria-labelledby="package-contents">
      {/* `sm:py-20`, как у соседних секций: было `sm:py-16`, и на ширинах от
          640 px эта секция шла с полями 64 px между соседями по 80 px —
          вертикальный ритм страницы сбивался на одной секции из шести. */}
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:py-20">
        <h2 className="display text-3xl sm:text-4xl" id="package-contents">
          {t('landing.packageTitle')}
        </h2>
        {/* Границы ячеек вместо `gap-px` — см. пояснение в `Claims`. */}
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {items.map((item, index) => (
            <li
              key={item}
              // Нечётный последний пункт занимает обе колонки: иначе в сетке
              // остаётся пустая ячейка и читается как недостающий пункт.
              className={`surface flex items-center gap-3 px-4 py-4 text-sm text-ink-700 ${
                index === items.length - 1 && items.length % 2 === 1 ? 'sm:col-span-2' : ''
              }`}
            >
              <Icon name="check" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-prose text-sm text-ink-600">{t('landing.packageNote')}</p>
      </div>
    </section>
  );
}

/* ---------------------------- Вопросы и ответы ------------------------------ */

function Faq(): JSX.Element {
  const { t } = useTranslation();
  const items = t('landing.faq', { returnObjects: true }) as Array<{ q: string; a: string }>;

  return (
    <section className="bg-white" aria-labelledby="faq-title">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:py-20" id="faq">
        <h2 className="display text-3xl sm:text-4xl" id="faq-title">
          {t('landing.faqTitle')}
        </h2>
        {/* Нативный <details>: раскрывается и без скриптов, читается программами
            чтения с экрана без единого атрибута aria. */}
        <div className="mt-8 grid gap-3">
          {items.map((item) => (
            <details key={item.q} className="faq-item group">
              <summary className="touch-target flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 text-base font-medium text-ink-900 marker:content-none">
                <span>{item.q}</span>
                <span
                  className="shrink-0 text-xl leading-none text-accent-500 group-open:hidden"
                  aria-hidden="true"
                >
                  +
                </span>
                <span
                  className="hidden shrink-0 text-xl leading-none text-accent-500 group-open:inline"
                  aria-hidden="true"
                >
                  −
                </span>
              </summary>
              <p className="max-w-prose px-5 pb-5 text-base text-ink-600">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

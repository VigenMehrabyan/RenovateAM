/**
 * Форма быстрого расчёта — герой лендинга. Считает локально движком
 * pricing-core, сеть на пути к результату не стоит: `POST /pricing/estimate`
 * уходит фоном, только ради аналитики, и его провал результат не отменяет.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Field, Select, TextInput, Button, describedBy } from '@/components/ui';
import { toApiLocale, isLocale } from '@/i18n';
import { pricingApi } from '@/lib/api';
import { attachEstimateId, nextEstimateToken, saveEstimate } from '@/lib/estimate-storage';
import { calculatorSchema } from '@/lib/validation';
import type { CalculatorValues } from '@/lib/validation';

const OBJECT_TYPES = ['APARTMENT', 'HOUSE'] as const;
const WORK_SCOPES = ['TURNKEY', 'FINISHING', 'ROUGH'] as const;
const FINISH_PACKAGES = ['STANDARD', 'DESIGNER'] as const;
const CONDITIONS = ['NEW_BUILDING', 'SECONDARY_WITH_DEMOLITION'] as const;
const CEILINGS = ['UP_TO_3M', 'FROM_3M'] as const;

export function CalculatorForm(): JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CalculatorValues>({
    resolver: zodResolver(calculatorSchema),
    defaultValues: {
      objectType: 'APARTMENT',
      workScope: 'TURNKEY',
      finishPackage: 'STANDARD',
      condition: 'NEW_BUILDING',
      ceilingHeight: 'UP_TO_3M',
    },
  });

  const finishPackage = watch('finishPackage');

  const onSubmit = handleSubmit((values) => {
    const token = nextEstimateToken();
    saveEstimate({ input: values, calculatedAt: new Date().toISOString(), token });

    // Фоновая аналитика: расчёт должен попасть в БД (US-1), но UI её не ждёт.
    // Ответ дописывается к расчёту только по метке: медленный ответ прошлого
    // нажатия не имеет права затереть более свежий расчёт.
    void pricingApi
      .estimate({
        ...values,
        locale: toApiLocale(isLocale(i18n.language) ? i18n.language : 'ru'),
      })
      .then((saved) => {
        attachEstimateId(token, saved.id);
      })
      .catch(() => {
        /* аналитика не должна ломать расчёт */
      });

    navigate('/estimate');
  });

  const areaError = errors.areaSqm?.message ? t(errors.areaSqm.message) : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field
        id="areaSqm"
        label={`${t('calculator.area')}, ${t('calculator.areaUnit')}`}
        hint={t('calculator.areaHint')}
        error={areaError}
        className="sm:col-span-2"
      >
        <TextInput
          id="areaSqm"
          type="number"
          inputMode="decimal"
          step="any"
          min={10}
          max={1000}
          placeholder={t('calculator.areaPlaceholder')}
          className="text-lg"
          aria-invalid={Boolean(areaError)}
          aria-describedby={describedBy('areaSqm', t('calculator.areaHint'), areaError)}
          {...register('areaSqm', { setValueAs: (value) => (value === '' ? NaN : Number(value)) })}
        />
      </Field>

      <Field id="objectType" label={t('calculator.objectType')}>
        <Select id="objectType" {...register('objectType')}>
          {OBJECT_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`calculator.objectTypeOptions.${value}`)}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="workScope" label={t('calculator.workScope')}>
        <Select id="workScope" {...register('workScope')}>
          {WORK_SCOPES.map((value) => (
            <option key={value} value={value}>
              {t(`calculator.workScopeOptions.${value}`)}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        id="finishPackage"
        label={t('calculator.finishPackage')}
        hint={finishPackage === 'DESIGNER' ? t('calculator.designerHint') : undefined}
      >
        <Select
          id="finishPackage"
          aria-describedby={finishPackage === 'DESIGNER' ? 'finishPackage-hint' : undefined}
          {...register('finishPackage')}
        >
          {FINISH_PACKAGES.map((value) => (
            <option key={value} value={value}>
              {t(`calculator.finishPackageOptions.${value}`)}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="condition" label={t('calculator.condition')}>
        <Select id="condition" {...register('condition')}>
          {CONDITIONS.map((value) => (
            <option key={value} value={value}>
              {t(`calculator.conditionOptions.${value}`)}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="ceilingHeight" label={t('calculator.ceilingHeight')} className="sm:col-span-2">
        <Select id="ceilingHeight" {...register('ceilingHeight')}>
          {CEILINGS.map((value) => (
            <option key={value} value={value}>
              {t(`calculator.ceilingHeightOptions.${value}`)}
            </option>
          ))}
        </Select>
      </Field>

      <Button type="submit" className="mt-1 w-full sm:col-span-2" disabled={isSubmitting}>
        {t('calculator.submit')}
      </Button>
    </form>
  );
}

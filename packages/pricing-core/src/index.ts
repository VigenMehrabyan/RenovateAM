/**
 * pricing-core — чистое ядро расчёта предварительной стоимости ремонта.
 *
 * Пакет намеренно не зависит ни от NestJS, ни от Prisma, ни от DOM:
 * одна и та же реализация исполняется в браузере (мгновенный отклик формы)
 * и на сервере (источник истины, результат которого сохраняется в БД).
 *
 * Инварианты:
 *  1. `calculateEstimate` — чистая функция: без ввода-вывода, без Date.now(),
 *     без случайности. Один и тот же вход всегда даёт один и тот же выход.
 *  2. Дизайнерский пакет НИКОГДА не возвращает суммы — только
 *     `needsManualReview: true`.
 *  3. Ставки приходят снаружи (из версионированного набора в БД). Константы
 *     из этого файла — только значения по умолчанию и сид первой версии.
 */

/* -------------------------------------------------------------------------- */
/* Входные параметры                                                          */
/* -------------------------------------------------------------------------- */

/** Тип объекта. */
export type ObjectType = 'APARTMENT' | 'HOUSE';

/** Объём работ. */
export type WorkScope = 'TURNKEY' | 'FINISHING' | 'ROUGH';

/** Пакет отделки. DESIGNER всегда уходит на ручное рассмотрение. */
export type FinishPackage = 'STANDARD' | 'DESIGNER';

/** Состояние объекта. */
export type PropertyCondition = 'NEW_BUILDING' | 'SECONDARY_WITH_DEMOLITION';

/** Высота потолков. */
export type CeilingHeight = 'UP_TO_3M' | 'FROM_3M';

/** Параметры объекта, введённые пользователем в форме быстрого расчёта. */
export interface EstimateInput {
  /** Площадь в м². Допустимый диапазон — [MIN_AREA_SQM, MAX_AREA_SQM]. */
  readonly areaSqm: number;
  readonly objectType: ObjectType;
  readonly workScope: WorkScope;
  readonly finishPackage: FinishPackage;
  readonly condition: PropertyCondition;
  readonly ceilingHeight: CeilingHeight;
}

/* -------------------------------------------------------------------------- */
/* Набор ставок                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Набор ставок одной версии. Значения приходят из таблицы `pricing_rates`
 * (ключ → значение) и складываются в этот объект на границе приложения.
 */
export interface RateSet {
  /** Идентификатор версии набора (`rate_versions.id`), фиксируется в расчёте. */
  readonly versionId: string;
  /** Базовая ставка за 1 м², целое число драмов. */
  readonly baseRateAmd: number;
  /** Кобъём. */
  readonly workScope: Readonly<Record<WorkScope, number>>;
  /** Кобъект. */
  readonly objectType: Readonly<Record<ObjectType, number>>;
  /** Ксостояние. */
  readonly condition: Readonly<Record<PropertyCondition, number>>;
  /** Кпотолки. */
  readonly ceilingHeight: Readonly<Record<CeilingHeight, number>>;
  /** Нижняя граница вилки как доля от базовой суммы. */
  readonly rangeMin: number;
  /** Верхняя граница вилки как доля от базовой суммы. */
  readonly rangeMax: number;
}

/** Применённые к расчёту множители — для прозрачности и отладки. */
export interface AppliedCoefficients {
  readonly workScope: number;
  readonly objectType: number;
  readonly condition: number;
  readonly ceilingHeight: number;
}

/* -------------------------------------------------------------------------- */
/* Результат                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Расчёт выполнен: стандартный пакет, автоматическая вилка.
 * Все суммы — целые числа драмов.
 */
export interface AutomaticEstimateResult {
  readonly needsManualReview: false;
  /** Версия ставок, по которой сделан расчёт. */
  readonly rateVersionId: string;
  /** Базовая сумма до применения вилки. */
  readonly amountBase: number;
  /** Нижняя граница вилки. */
  readonly amountMin: number;
  /** Верхняя граница вилки. */
  readonly amountMax: number;
  readonly applied: AppliedCoefficients;
  readonly currency: 'AMD';
}

/**
 * Расчёт не выполняется: выбран дизайнерский пакет.
 * Сумм в этом варианте нет — ни одной, намеренно.
 */
export interface ManualReviewResult {
  readonly needsManualReview: true;
  readonly rateVersionId: string;
  readonly reason: 'DESIGNER_PACKAGE';
}

/** Результат расчёта: либо вилка, либо маршрутизация на сметчика. */
export type EstimateResult = AutomaticEstimateResult | ManualReviewResult;

/* -------------------------------------------------------------------------- */
/* Константы по умолчанию                                                     */
/* -------------------------------------------------------------------------- */

/** Минимальная площадь, м². */
export const MIN_AREA_SQM = 10;

/** Максимальная площадь, м². */
export const MAX_AREA_SQM = 1000;

/** Срок действия быстрого расчёта, дней. */
export const ESTIMATE_VALIDITY_DAYS = 30;

/** Базовая ставка по умолчанию: 60 000 AMD за 1 м². */
export const DEFAULT_BASE_RATE_AMD = 60_000;

/** Коэффициенты по умолчанию (README, раздел «Ценовая модель»). */
export const DEFAULT_WORK_SCOPE_COEFFICIENTS: Readonly<Record<WorkScope, number>> = {
  TURNKEY: 1.0,
  FINISHING: 0.6,
  ROUGH: 0.45,
};

export const DEFAULT_OBJECT_TYPE_COEFFICIENTS: Readonly<Record<ObjectType, number>> = {
  APARTMENT: 1.0,
  HOUSE: 1.15,
};

export const DEFAULT_CONDITION_COEFFICIENTS: Readonly<Record<PropertyCondition, number>> = {
  NEW_BUILDING: 1.0,
  SECONDARY_WITH_DEMOLITION: 1.15,
};

export const DEFAULT_CEILING_COEFFICIENTS: Readonly<Record<CeilingHeight, number>> = {
  UP_TO_3M: 1.0,
  FROM_3M: 1.1,
};

/** Границы вилки по умолчанию: −15% … +15%. */
export const DEFAULT_RANGE_MIN = 0.85;
export const DEFAULT_RANGE_MAX = 1.15;

/**
 * Набор ставок по умолчанию. Используется как сид первой версии в БД и как
 * запасной вариант на клиенте, если `GET /pricing/rates` ещё не ответил.
 * `versionId` намеренно пустой — реальный расчёт обязан получить версию из БД.
 */
export const DEFAULT_RATE_SET: RateSet = {
  versionId: '',
  baseRateAmd: DEFAULT_BASE_RATE_AMD,
  workScope: DEFAULT_WORK_SCOPE_COEFFICIENTS,
  objectType: DEFAULT_OBJECT_TYPE_COEFFICIENTS,
  condition: DEFAULT_CONDITION_COEFFICIENTS,
  ceilingHeight: DEFAULT_CEILING_COEFFICIENTS,
  rangeMin: DEFAULT_RANGE_MIN,
  rangeMax: DEFAULT_RANGE_MAX,
};

/* -------------------------------------------------------------------------- */
/* Валидация                                                                  */
/* -------------------------------------------------------------------------- */

/** Код ошибки валидации входных параметров. */
export type EstimateValidationCode = 'AREA_OUT_OF_RANGE' | 'AREA_NOT_A_NUMBER';

/** Ошибка валидации входных параметров расчёта. */
export class EstimateValidationError extends Error {
  readonly code: EstimateValidationCode;

  constructor(code: EstimateValidationCode, message: string) {
    super(message);
    this.name = 'EstimateValidationError';
    this.code = code;
  }
}

/**
 * Проверяет площадь. Вынесено отдельно, чтобы форма на клиенте могла
 * подсветить поле, не вызывая расчёт.
 *
 * @throws {EstimateValidationError}
 */
export function assertValidArea(areaSqm: number): void {
  if (!Number.isFinite(areaSqm)) {
    throw new EstimateValidationError('AREA_NOT_A_NUMBER', 'Площадь должна быть числом');
  }
  if (areaSqm < MIN_AREA_SQM || areaSqm > MAX_AREA_SQM) {
    throw new EstimateValidationError(
      'AREA_OUT_OF_RANGE',
      `Площадь должна быть от ${MIN_AREA_SQM} до ${MAX_AREA_SQM} м²`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Расчёт                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Округление до целого драма. Единая точка округления: и клиент, и сервер
 * обязаны получить бит-в-бит одинаковый результат.
 */
function toAmd(value: number): number {
  return Math.round(value);
}

/**
 * Считает предварительную стоимость ремонта.
 *
 * Формула (README):
 * ```
 * base = area × baseRateAmd × Кобъём × Кобъект × Ксостояние × Кпотолки
 * min  = base × rangeMin
 * max  = base × rangeMax
 * ```
 *
 * Для дизайнерского пакета расчёт не выполняется: функция возвращает
 * `{ needsManualReview: true }` без каких-либо сумм.
 *
 * @param input Параметры объекта из формы быстрого расчёта.
 * @param rates Набор ставок конкретной версии (фиксируется на старте расчёта).
 * @returns Вилка стоимости либо маршрутизация на ручное рассмотрение.
 * @throws {EstimateValidationError} если площадь вне допустимого диапазона.
 *
 * @example
 * calculateEstimate(
 *   { areaSqm: 80, objectType: 'APARTMENT', workScope: 'TURNKEY',
 *     finishPackage: 'STANDARD', condition: 'NEW_BUILDING', ceilingHeight: 'UP_TO_3M' },
 *   { ...DEFAULT_RATE_SET, versionId: 'v1' },
 * );
 * // → { needsManualReview: false, amountBase: 4_800_000,
 * //     amountMin: 4_080_000, amountMax: 5_520_000, ... }
 */
export function calculateEstimate(input: EstimateInput, rates: RateSet): EstimateResult {
  assertValidArea(input.areaSqm);

  if (input.finishPackage === 'DESIGNER') {
    return {
      needsManualReview: true,
      rateVersionId: rates.versionId,
      reason: 'DESIGNER_PACKAGE',
    };
  }

  const applied: AppliedCoefficients = {
    workScope: rates.workScope[input.workScope],
    objectType: rates.objectType[input.objectType],
    condition: rates.condition[input.condition],
    ceilingHeight: rates.ceilingHeight[input.ceilingHeight],
  };

  const raw =
    input.areaSqm *
    rates.baseRateAmd *
    applied.workScope *
    applied.objectType *
    applied.condition *
    applied.ceilingHeight;

  const amountBase = toAmd(raw);

  return {
    needsManualReview: false,
    rateVersionId: rates.versionId,
    amountBase,
    amountMin: toAmd(raw * rates.rangeMin),
    amountMax: toAmd(raw * rates.rangeMax),
    applied,
    currency: 'AMD',
  };
}

/**
 * Собирает `RateSet` из плоского набора «ключ → значение», как он лежит
 * в таблице `pricing_rates`. Отсутствующие ключи берутся из значений
 * по умолчанию — версия ставок может не содержать всех ключей.
 *
 * @param versionId Идентификатор версии (`rate_versions.id`).
 * @param values Плоская карта ключей ставок.
 */
export function buildRateSet(versionId: string, values: Readonly<Record<string, number>>): RateSet {
  const pick = (key: string, fallback: number): number =>
    typeof values[key] === 'number' && Number.isFinite(values[key]) ? values[key] : fallback;

  return {
    versionId,
    baseRateAmd: pick('base_rate_amd', DEFAULT_BASE_RATE_AMD),
    workScope: {
      TURNKEY: pick('scope_turnkey', DEFAULT_WORK_SCOPE_COEFFICIENTS.TURNKEY),
      FINISHING: pick('scope_finishing', DEFAULT_WORK_SCOPE_COEFFICIENTS.FINISHING),
      ROUGH: pick('scope_rough', DEFAULT_WORK_SCOPE_COEFFICIENTS.ROUGH),
    },
    objectType: {
      APARTMENT: pick('object_apartment', DEFAULT_OBJECT_TYPE_COEFFICIENTS.APARTMENT),
      HOUSE: pick('object_house', DEFAULT_OBJECT_TYPE_COEFFICIENTS.HOUSE),
    },
    condition: {
      NEW_BUILDING: pick('condition_new', DEFAULT_CONDITION_COEFFICIENTS.NEW_BUILDING),
      SECONDARY_WITH_DEMOLITION: pick(
        'condition_secondary',
        DEFAULT_CONDITION_COEFFICIENTS.SECONDARY_WITH_DEMOLITION,
      ),
    },
    ceilingHeight: {
      UP_TO_3M: pick('ceiling_up_to_3m', DEFAULT_CEILING_COEFFICIENTS.UP_TO_3M),
      FROM_3M: pick('ceiling_from_3m', DEFAULT_CEILING_COEFFICIENTS.FROM_3M),
    },
    rangeMin: pick('range_min', DEFAULT_RANGE_MIN),
    rangeMax: pick('range_max', DEFAULT_RANGE_MAX),
  };
}

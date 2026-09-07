/**
 * Последний расчёт гостя. Живёт в sessionStorage: он нужен, чтобы перейти
 * с лендинга на экран результата и дальше — в регистрацию и заявку,
 * не потеряв параметры. Цена в хранилище не кладётся: её всегда пересчитывает
 * pricing-core по актуальным ставкам.
 */
import { z } from 'zod';
import { calculatorSchema, type CalculatorValues } from './validation';

const KEY = 'renovateam.estimate';

export interface StoredEstimate {
  input: CalculatorValues;
  /** id расчёта, сохранённого сервером для аналитики (может отсутствовать). */
  estimateId?: string;
  /** ISO-время расчёта — от него отсчитываются 30 дней действия. */
  calculatedAt: string;
  /** Метка конкретного нажатия «Рассчитать»; см. `attachEstimateId`. */
  token?: string;
}

let tokenCounter = 0;
let memoryEstimate: StoredEstimate | null = null;
let writeUnavailable = false;
const storedSchema = z.object({
  input: calculatorSchema,
  calculatedAt: z.string().datetime(),
  estimateId: z.string().optional(),
  token: z.string().optional(),
});

/** Уникальная метка расчёта: времени мало — два нажатия попадают в одну миллисекунду. */
export function nextEstimateToken(): string {
  tokenCounter += 1;
  return `${Date.now().toString(36)}-${tokenCounter}`;
}

export function saveEstimate(value: StoredEstimate): void {
  memoryEstimate = value;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(value));
    writeUnavailable = false;
  } catch {
    writeUnavailable = true;
    /* Вкладка продолжает работать, даже когда браузер запрещает хранилище. */
  }
}

/**
 * Дописывает к сохранённому расчёту его серверный id — но только если в
 * хранилище всё ещё лежит тот же самый расчёт.
 *
 * Запрос аналитики уходит фоном и может ответить уже после того, как
 * пользователь пересчитал заново. Безусловная запись подменяла бы свежий
 * расчёт устаревшим: пользователь, выбравший дизайнерский пакет, после
 * перезагрузки увидел бы стандартный — с суммой, которой у него быть не должно,
 * а к заявке прикрепился бы чужой `quickEstimateId`.
 */
export function attachEstimateId(token: string, estimateId: string): void {
  const current = readEstimate();
  if (!current || current.token !== token) return;
  saveEstimate({ ...current, estimateId });
}

export function readEstimate(): StoredEstimate | null {
  if (writeUnavailable) return memoryEstimate;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(KEY);
  } catch {
    return memoryEstimate;
  }
  if (!raw) return null;
  try {
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as StoredEstimate) : null;
  } catch {
    return null;
  }
}

export function clearEstimate(): void {
  memoryEstimate = null;
  try {
    window.sessionStorage.removeItem(KEY);
    writeUnavailable = false;
  } catch {
    writeUnavailable = true;
    /* нечего чистить */
  }
}

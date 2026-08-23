/**
 * Последний расчёт гостя. Живёт в sessionStorage: он нужен, чтобы перейти
 * с лендинга на экран результата и дальше — в регистрацию и заявку,
 * не потеряв параметры. Цена в хранилище не кладётся: её всегда пересчитывает
 * pricing-core по актуальным ставкам.
 */
import type { CalculatorValues } from './validation';

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

/** Уникальная метка расчёта: времени мало — два нажатия попадают в одну миллисекунду. */
export function nextEstimateToken(): string {
  tokenCounter += 1;
  return `${Date.now().toString(36)}-${tokenCounter}`;
}

export function saveEstimate(value: StoredEstimate): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* приватный режим — работаем без сохранения */
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
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredEstimate;
    return parsed?.input ? parsed : null;
  } catch {
    return null;
  }
}

export function clearEstimate(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* нечего чистить */
  }
}

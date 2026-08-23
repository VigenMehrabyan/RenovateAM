/**
 * Единый HTTP-клиент.
 *
 * Три решения, зафиксированные архитектурой (§6.1, §9):
 *  1. access-токен живёт только в памяти модуля — ни localStorage, ни cookie;
 *  2. refresh лежит в httpOnly-cookie, поэтому все запросы идут с
 *     `credentials: 'include'`, а при 401 клиент один раз дёргает
 *     `/auth/refresh` и повторяет исходный запрос;
 *  3. текст ошибки пользователю выбирается на клиенте **по коду** —
 *     `message` из ответа сервера в интерфейс не попадает никогда.
 */

export interface ApiErrorDetail {
  field: string;
  code: string;
}

/** Ошибка API в формате `{ error: { code, message, details?, requestId } }`. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: ApiErrorDetail[];
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(params: {
    code: string;
    status: number;
    message?: string;
    details?: ApiErrorDetail[];
    requestId?: string | null;
    retryAfterSeconds?: number | null;
  }) {
    super(params.message ?? params.code);
    this.name = 'ApiError';
    this.code = params.code;
    this.status = params.status;
    this.details = params.details ?? [];
    this.requestId = params.requestId ?? null;
    this.retryAfterSeconds = params.retryAfterSeconds ?? null;
  }
}

/** Базовый адрес API. В проде — относительный путь через прокси Netlify. */
export const API_URL: string =
  (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api/v1';

/* --------------------------------------------------------------------------- */
/* Хранилище access-токена — только память                                     */
/* --------------------------------------------------------------------------- */

let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

/**
 * Поколение сессии. Растёт при каждом выходе. Обновление токена, начатое до
 * выхода, но завершившееся после него, относится к прошлому поколению и свой
 * результат не записывает: иначе после logout в памяти снова оказался бы
 * живой access-токен.
 */
let sessionEpoch = 0;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Полный сброс сессии: токен стирается, запоздавшее обновление игнорируется. */
export function clearSession(): void {
  accessToken = null;
  sessionEpoch += 1;
  refreshInFlight = null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Подписка на «сессия окончательно потеряна» — используется AuthProvider. */
export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler;
}

/* --------------------------------------------------------------------------- */
/* Разбор ответа                                                               */
/* --------------------------------------------------------------------------- */

function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get('Retry-After');
  if (!header) return null;
  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) ? seconds : null;
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = 'UNKNOWN';
  let message: string | undefined;
  let details: ApiErrorDetail[] | undefined;
  let requestId: string | null = null;

  try {
    const body: unknown = await response.json();
    const error = (body as { error?: Record<string, unknown> })?.error;
    if (error && typeof error.code === 'string') {
      code = error.code;
      message = typeof error.message === 'string' ? error.message : undefined;
      details = Array.isArray(error.details) ? (error.details as ApiErrorDetail[]) : undefined;
      requestId = typeof error.requestId === 'string' ? error.requestId : null;
    }
  } catch {
    /* тело не JSON — остаётся UNKNOWN */
  }

  if (code === 'UNKNOWN' && response.status >= 500) code = 'INTERNAL_ERROR';

  return new ApiError({
    code,
    status: response.status,
    message,
    details,
    requestId,
    retryAfterSeconds: parseRetryAfter(response),
  });
}

/* --------------------------------------------------------------------------- */
/* Обновление токена                                                           */
/* --------------------------------------------------------------------------- */

let refreshInFlight: Promise<string | null> | null = null;

/** Один общий запрос обновления на все параллельные 401. */
export async function refreshAccessToken(): Promise<string | null> {
  const epoch = sessionEpoch;

  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { accessToken?: string };
      if (typeof body.accessToken !== 'string') return null;
      // Пока шло обновление, пользователь мог выйти: токен прошлой сессии
      // в память не возвращаем.
      if (epoch !== sessionEpoch) return null;
      accessToken = body.accessToken;
      return body.accessToken;
    } catch {
      return null;
    } finally {
      if (epoch === sessionEpoch) refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/* --------------------------------------------------------------------------- */
/* Запрос                                                                      */
/* --------------------------------------------------------------------------- */

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** multipart — тело передаётся как есть, Content-Type ставит браузер. */
  formData?: FormData;
  /** Не пытаться обновлять токен (сами эндпоинты аутентификации). */
  skipRefresh?: boolean;
  signal?: AbortSignal;
}

async function send(
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const init: RequestInit = {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers,
  };
  if (options.formData) init.body = options.formData;
  else if (options.body !== undefined) init.body = JSON.stringify(options.body);
  if (options.signal) init.signal = options.signal;

  return fetch(`${API_URL}${path}`, init);
}

/**
 * Выполняет запрос к API. При 401 один раз обновляет access-токен и повторяет
 * запрос; если обновление не удалось — сообщает о потере сессии.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await send(path, options, accessToken);
  } catch {
    throw new ApiError({ code: 'NETWORK', status: 0 });
  }

  if (response.status === 401 && !options.skipRefresh) {
    const renewed = await refreshAccessToken();
    if (renewed) {
      try {
        response = await send(path, options, renewed);
      } catch {
        throw new ApiError({ code: 'NETWORK', status: 0 });
      }
    } else {
      clearSession();
      onSessionLost?.();
    }
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

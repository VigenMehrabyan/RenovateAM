import { HttpException } from '@nestjs/common';
import type { ErrorCodeValue } from './error-codes';

/**
 * Доменное исключение с машинным кодом. Единственный способ вернуть ошибку
 * из сервисов: HTTP-статус и код всегда идут парой и не расходятся.
 */
export class AppException extends HttpException {
  readonly code: ErrorCodeValue;
  readonly details: Array<{ field: string; code: string }> | undefined;
  readonly headers: Record<string, string> | undefined;

  constructor(
    status: number,
    code: ErrorCodeValue,
    message: string,
    options?: {
      details?: Array<{ field: string; code: string }>;
      headers?: Record<string, string>;
    },
  ) {
    super({ code, message }, status);
    this.code = code;
    this.details = options?.details;
    this.headers = options?.headers;
  }
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AppException } from './app.exception';
import { ErrorCode, type ApiErrorBody } from './error-codes';

/**
 * Единый формат ответа об ошибке (docs/ARCHITECTURE.md §9).
 * Наружу никогда не уходят стек, SQL и содержимое исключений 5xx.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as Request & { requestId?: string }).requestId ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCode.INTERNAL_ERROR;
    let message = 'Internal server error';
    let details: Array<{ field: string; code: string }> | undefined;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.code;
      message = extractMessage(exception);
      details = exception.details;
      for (const [header, value] of Object.entries(exception.headers ?? {})) {
        response.setHeader(header, value);
      }
    } else if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      code = ErrorCode.RATE_LIMITED;
      message = 'Too many requests';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      message = extractMessage(exception);
      code = mapStatusToCode(status);
      if (typeof payload === 'object' && payload !== null && 'message' in payload) {
        const raw = (payload as { message: unknown }).message;
        if (Array.isArray(raw)) {
          code = ErrorCode.VALIDATION_FAILED;
          status = HttpStatus.UNPROCESSABLE_ENTITY;
          message = 'Validation failed';
          details = raw.map((item) => parseValidationMessage(String(item)));
        }
      }
    }

    if (status >= 500) {
      this.logger.error(
        { requestId, method: request.method, path: request.url, code },
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorBody = {
      error: { code, message, requestId, ...(details ? { details } : {}) },
    };
    response.status(status).json(body);
  }
}

function extractMessage(exception: HttpException): string {
  const payload = exception.getResponse();
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object' && payload !== null && 'message' in payload) {
    const raw = (payload as { message: unknown }).message;
    if (typeof raw === 'string') return raw;
  }
  return exception.message;
}

function mapStatusToCode(status: number): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return ErrorCode.INVALID_CREDENTIALS;
    case HttpStatus.FORBIDDEN:
      return ErrorCode.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ErrorCode.NOT_FOUND;
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return ErrorCode.FILE_TOO_LARGE;
    case HttpStatus.UNSUPPORTED_MEDIA_TYPE:
      return ErrorCode.UNSUPPORTED_MEDIA_TYPE;
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return ErrorCode.VALIDATION_FAILED;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ErrorCode.RATE_LIMITED;
    case HttpStatus.BAD_REQUEST:
      return ErrorCode.MALFORMED_REQUEST;
    default:
      return ErrorCode.INTERNAL_ERROR;
  }
}

/** class-validator отдаёт строки вида "areaSqm must not be less than 10". */
function parseValidationMessage(text: string): { field: string; code: string } {
  const field = text.split(' ')[0] ?? 'unknown';
  return { field, code: 'INVALID' };
}

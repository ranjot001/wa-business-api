import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ERROR_CODES, type ErrorBody } from '@crm/shared';

/**
 * The one and only error shape this API ever returns:
 *
 *   { "error": { "code": "NOT_FOUND", "message": "...", "details": {...} } }
 *
 * Codes are SCREAMING_SNAKE. A thrown HttpException may carry its own code by
 * throwing an object response: `throw new BadRequestException({ code: 'WINDOW_CLOSED', message: '...' })`.
 * Anything else is mapped from the HTTP status, and unknown errors become a
 * 500 INTERNAL_ERROR with the real reason logged but not leaked.
 */
const STATUS_TO_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODES.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ERROR_CODES.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ERROR_CODES.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ERROR_CODES.NOT_FOUND,
  [HttpStatus.CONFLICT]: ERROR_CODES.CONFLICT,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ERROR_CODES.VALIDATION_FAILED,
  [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODES.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ERROR_CODES.SERVICE_UNAVAILABLE,
};

interface NestExceptionResponse {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  error?: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = this.toBody(exception, status);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { err: exception, path: request.url, method: request.method },
        `Unhandled error on ${request.method} ${request.url}`,
      );
    }

    response.status(status).json(body);
  }

  private toBody(exception: unknown, status: number): ErrorBody {
    if (!(exception instanceof HttpException)) {
      return {
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Internal server error',
        },
      };
    }

    const raw = exception.getResponse();
    const fallbackCode = STATUS_TO_CODE[status] ?? ERROR_CODES.INTERNAL_ERROR;

    if (typeof raw === 'string') {
      return { error: { code: fallbackCode, message: raw } };
    }

    const payload = raw as NestExceptionResponse;

    // ValidationPipe reports an array of messages. Keep them in details so the
    // top level message stays a single readable sentence.
    const isValidationArray = Array.isArray(payload.message);
    const code =
      typeof payload.code === 'string'
        ? payload.code
        : isValidationArray
          ? ERROR_CODES.VALIDATION_FAILED
          : fallbackCode;

    const message = isValidationArray
      ? 'Request validation failed'
      : typeof payload.message === 'string'
        ? payload.message
        : exception.message;

    const details = isValidationArray ? { issues: payload.message } : payload.details;

    const error: ErrorBody['error'] = { code, message };
    if (details !== undefined) {
      error.details = details;
    }

    return { error };
  }
}

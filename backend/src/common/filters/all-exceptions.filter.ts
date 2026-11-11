import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { STATUS_CODES } from 'node:http';
import type {
  ErrorResponseBody,
  RequestLike,
} from '../interfaces/error-response.interface.js';

const INTERNAL_ERROR_MESSAGE = 'Internal server error';

/**
 * Single place where errors become HTTP responses, so every error has the
 * same shape. Unexpected errors are logged with their stack and answered with
 * a generic message: internal details never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const http = host.switchToHttp();
    const request = http.getRequest<RequestLike>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        exception instanceof Error
          ? exception.message
          : 'Non-error value thrown',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ErrorResponseBody = {
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      message: this.resolveMessage(exception, statusCode),
      code: this.resolveCode(exception),
      requestId: this.resolveRequestId(request),
      timestamp: new Date().toISOString(),
      path: this.resolvePath(request),
    };

    httpAdapter.reply(http.getResponse(), body, statusCode);
  }

  private resolveMessage(
    exception: unknown,
    statusCode: number,
  ): string | string[] {
    if (!(exception instanceof HttpException)) {
      return INTERNAL_ERROR_MESSAGE;
    }

    const response = exception.getResponse();
    if (typeof response === 'string') {
      return response;
    }

    const message = (response as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
    if (
      Array.isArray(message) &&
      message.every((item) => typeof item === 'string')
    ) {
      return message;
    }

    return STATUS_CODES[statusCode] ?? 'Error';
  }

  private resolveCode(exception: unknown): string | undefined {
    if (!(exception instanceof HttpException)) return undefined;

    const response = exception.getResponse();
    const code =
      typeof response === 'object'
        ? (response as { code?: unknown }).code
        : undefined;
    return typeof code === 'string' ? code : undefined;
  }

  private resolveRequestId(request: RequestLike): string | undefined {
    return typeof request.id === 'string' ? request.id : undefined;
  }

  /** The query string is dropped so it can never echo user data back. */
  private resolvePath(request: RequestLike): string {
    return (request.originalUrl ?? request.url ?? '').split('?')[0];
  }
}

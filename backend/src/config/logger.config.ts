import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';
import type { LoggerEnv } from './interfaces/config.interface.js';

export const REQUEST_ID_HEADER = 'x-request-id';

const HEALTH_PATH_PREFIX = '/api/v1/health';
const SERVER_ERROR_STATUS = 500;
const CLIENT_ERROR_STATUS = 400;

/**
 * Structured request logging.
 *
 * - Every request gets a server-generated id, returned in the response header
 *   and attached to every log line written while handling it.
 * - Only the method, path and status are recorded. Headers, cookies, bodies
 *   and query strings are never logged; the redact list is a second barrier
 *   in case a serializer is changed later.
 */
export function buildLoggerOptions(env: LoggerEnv): Params {
  return {
    pinoHttp: {
      level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
      transport: env.LOG_PRETTY
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
      genReqId: (_request: IncomingMessage, response: ServerResponse) => {
        const id = randomUUID();
        response.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },
      formatters: { level: (label: string) => ({ level: label }) },
      timestamp: stdTimeFunctions.isoTime,
      serializers: {
        req: (request: { id: unknown; method: string; url?: string }) => ({
          id: request.id,
          method: request.method,
          path: (request.url ?? '').split('?')[0],
        }),
        res: (response: { statusCode: number }) => ({
          statusCode: response.statusCode,
        }),
      },
      customProps: (request: IncomingMessage) => ({
        ip: (request as IncomingMessage & { ip?: string }).ip,
      }),
      customLogLevel: (_request, response, error) => {
        if (error || response.statusCode >= SERVER_ERROR_STATUS) return 'error';
        if (response.statusCode >= CLIENT_ERROR_STATUS) return 'warn';
        return 'info';
      },
      autoLogging: {
        ignore: (request: IncomingMessage) =>
          (request.url ?? '').startsWith(HEALTH_PATH_PREFIX),
      },
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'res.headers["set-cookie"]',
        ],
        censor: '[REDACTED]',
      },
    },
  };
}

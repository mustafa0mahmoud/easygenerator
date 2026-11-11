import { env } from '../../config/env.ts';
import { createHttpClient } from './http-client.ts';

export { ApiError, NetworkError } from './errors.ts';
export { toUserMessage } from './error-message.ts';
export { createHttpClient } from './http-client.ts';
export type {
  HttpClient,
  RequestOptions,
} from './interfaces/http.interface.ts';

/** The application's API client. */
export const http = createHttpClient({
  baseUrl: env.apiBaseUrl,
  timeoutMs: env.requestTimeoutMs,
  refreshPath: '/auth/refresh',
});

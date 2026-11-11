import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../http/index.ts';

const MAX_QUERY_RETRIES = 2;
const SERVER_ERROR_MIN_STATUS = 500;

/**
 * A 4xx is the server's answer (not signed in, not found, invalid): asking
 * again returns the same thing. Only failures that can heal are retried.
 */
export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  if (error instanceof ApiError && error.status < SERVER_ERROR_MIN_STATUS) {
    return false;
  }
  return failureCount < MAX_QUERY_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetryQuery },
      // A mutation is never repeated on its own: it may not be idempotent.
      mutations: { retry: false },
    },
  });
}

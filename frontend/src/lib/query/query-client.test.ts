import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from '../http/index.ts';
import { shouldRetryQuery } from './query-client.ts';

const apiError = (status: number) => new ApiError({ status, message: 'x' });

describe('shouldRetryQuery', () => {
  it.each([400, 401, 403, 404, 409, 429])(
    'never retries a %i response',
    (status) => {
      expect(shouldRetryQuery(0, apiError(status))).toBe(false);
    },
  );

  it('retries server errors and network failures a limited number of times', () => {
    expect(shouldRetryQuery(0, apiError(503))).toBe(true);
    expect(shouldRetryQuery(1, new NetworkError('timeout'))).toBe(true);
    expect(shouldRetryQuery(2, apiError(503))).toBe(false);
    expect(shouldRetryQuery(2, new NetworkError('unreachable'))).toBe(false);
  });
});

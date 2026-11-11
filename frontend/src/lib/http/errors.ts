import type {
  ApiErrorInit,
  NetworkFailureReason,
} from './interfaces/http.interface.ts';

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;
  readonly code: string | undefined;
  readonly details: readonly string[];
  /** Matches the `req.id` in the server logs. */
  readonly requestId: string | undefined;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.status = init.status;
    this.code = init.code;
    this.details = init.details ?? [init.message];
    this.requestId = init.requestId;
  }
}

export class NetworkError extends Error {
  override readonly name = 'NetworkError';
  readonly reason: NetworkFailureReason;

  constructor(reason: NetworkFailureReason, options?: ErrorOptions) {
    super(
      reason === 'timeout'
        ? 'The server took too long to respond.'
        : 'Could not reach the server.',
      options,
    );
    this.reason = reason;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

function readMessages(value: unknown): string[] {
  const candidates = Array.isArray(value) ? value : [value];
  return candidates.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  );
}

/**
 * Builds an `ApiError` from whatever body came back. The body is the API's
 * error shape when the API answered, but it can also be a proxy's HTML page
 * or nothing at all, so no field is assumed to exist.
 */
export function toApiError(status: number, payload: unknown): ApiError {
  const body = isRecord(payload) ? payload : {};
  const details = readMessages(body.message);

  return new ApiError({
    status,
    message: details[0] ?? `Request failed with status ${status}.`,
    details: details.length > 0 ? details : undefined,
    code: asString(body.code),
    requestId: asString(body.requestId),
  });
}

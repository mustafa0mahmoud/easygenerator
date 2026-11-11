import { ApiError, NetworkError, toApiError } from './errors.ts';
import type {
  HttpClient,
  HttpClientConfig,
  RequestOptions,
} from './interfaces/http.interface.ts';

const UNAUTHORIZED = 401;

function parseJson(text: string): unknown {
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The one place the application talks to the API.
 *
 * - `fetch` resolves for 4xx and 5xx; every response is checked with
 *   `response.ok` and a failure is thrown as an `ApiError`.
 * - Every request can be cancelled by its caller and is cut off by a timeout.
 * - An expired access token is renewed once, for all waiting requests
 *   together, and the request that hit the 401 is then sent again.
 */
export function createHttpClient(config: HttpClientConfig): HttpClient {
  const doFetch: typeof fetch =
    config.fetch ?? ((input, init) => globalThis.fetch(input, init));

  let refreshInFlight: Promise<void> | null = null;

  async function send<T>(path: string, options: RequestOptions): Promise<T> {
    const { method = 'GET', body, signal } = options;
    const timeoutMs = options.timeoutMs ?? config.timeoutMs;

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const forwardAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) forwardAbort();
    else signal?.addEventListener('abort', forwardAbort, { once: true });

    let response: Response;
    let text: string;
    try {
      response = await doFetch(`${config.baseUrl}${path}`, {
        method,
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      // Reading the body is part of the request: it can stall or be cancelled.
      text = await response.text();
    } catch (error) {
      // The caller cancelled on purpose: hand its abort back untouched so it
      // is never shown as a failure.
      if (signal?.aborted) throw error;
      throw new NetworkError(timedOut ? 'timeout' : 'unreachable', {
        cause: error,
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forwardAbort);
    }

    const payload = parseJson(text);
    if (!response.ok) throw toApiError(response.status, payload);
    // The caller names the shape it expects; callers that depend on it
    // validate the payload with a schema.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return payload as T;
  }

  /**
   * Renews the session. Requests that fail together share one call: the
   * refresh token is single-use, so a second parallel call would be rejected
   * and would sign the user out.
   */
  function refreshSession(): Promise<void> {
    refreshInFlight ??= send<void>(config.refreshPath, {
      method: 'POST',
    }).finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  async function request<T = void>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    try {
      return await send<T>(path, options);
    } catch (error) {
      const sessionExpired =
        error instanceof ApiError &&
        error.status === UNAUTHORIZED &&
        options.refreshOn401 !== false;
      if (!sessionExpired) throw error;

      try {
        await refreshSession();
      } catch (refreshError) {
        // A network failure is reported as itself: it does not mean
        // "signed out". A rejected refresh falls through to the retry below,
        // because another tab may have renewed the shared cookies first; if
        // the session is really over, the retry answers 401 and that is final.
        if (!(refreshError instanceof ApiError)) throw refreshError;
      }

      return send<T>(path, options);
    }
  }

  return {
    request,
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) =>
      request(path, { ...options, method: 'POST', body }),
  };
}

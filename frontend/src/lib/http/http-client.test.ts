import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from './errors.ts';
import { createHttpClient } from './http-client.ts';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const apiErrorBody = (statusCode: number, extra: object = {}) => ({
  statusCode,
  error: 'Error',
  message: 'Something went wrong',
  requestId: 'req-1',
  timestamp: '2026-01-01T00:00:00.000Z',
  path: '/api/v1/thing',
  ...extra,
});

/** A fetch that never answers, and rejects the way a browser does on abort. */
const hangingFetch: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    const signal = init?.signal;
    const abort = () => reject(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });

function setup(fetchMock: FetchMock) {
  return createHttpClient({
    baseUrl: '/api/v1',
    timeoutMs: 1_000,
    refreshPath: '/auth/refresh',
    fetch: fetchMock,
  });
}

const calledUrls = (fetchMock: FetchMock) =>
  fetchMock.mock.calls.map(([url]) => url);

afterEach(() => {
  vi.useRealTimers();
});

describe('http client', () => {
  describe('successful responses', () => {
    it('returns the parsed JSON body', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () => json(200, { id: '1' }));

      await expect(setup(fetchMock).get('/users/me')).resolves.toEqual({
        id: '1',
      });
      expect(calledUrls(fetchMock)).toEqual(['/api/v1/users/me']);
    });

    it('returns undefined for 204 No Content', async () => {
      const fetchMock = vi.fn<typeof fetch>(
        async () => new Response(null, { status: 204 }),
      );

      await expect(
        setup(fetchMock).post('/auth/logout'),
      ).resolves.toBeUndefined();
    });

    it('sends JSON with same-origin credentials', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () => json(200, {}));

      await setup(fetchMock).post('/auth/login', { email: 'a@b.co' });

      const init = fetchMock.mock.calls[0][1];
      expect(init).toMatchObject({
        method: 'POST',
        credentials: 'same-origin',
        body: '{"email":"a@b.co"}',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });
    });

    it('sends no body and no content type when there is nothing to send', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () => json(200, {}));

      await setup(fetchMock).get('/users/me');

      const init = fetchMock.mock.calls[0][1];
      expect(init?.body).toBeUndefined();
      expect(init?.headers).toEqual({ Accept: 'application/json' });
    });
  });

  describe('failed responses (response.ok is false)', () => {
    it('throws an ApiError carrying the API error fields', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        json(
          409,
          apiErrorBody(409, {
            message: 'Email is already registered',
            code: 'email_taken',
          }),
        ),
      );

      const error = await setup(fetchMock)
        .post('/auth/signup', {}, { refreshOn401: false })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 409,
        message: 'Email is already registered',
        code: 'email_taken',
        requestId: 'req-1',
        details: ['Email is already registered'],
      });
    });

    it('keeps every validation message', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        json(
          400,
          apiErrorBody(400, { message: ['name is too short', 'bad email'] }),
        ),
      );

      const error = await setup(fetchMock)
        .post('/auth/signup', {})
        .catch((caught: unknown) => caught);

      expect(error).toMatchObject({
        status: 400,
        message: 'name is too short',
        details: ['name is too short', 'bad email'],
      });
    });

    it('survives an error body that is not JSON', async () => {
      const fetchMock = vi.fn<typeof fetch>(
        async () =>
          new Response('<html>502 Bad Gateway</html>', { status: 502 }),
      );

      const error = await setup(fetchMock)
        .get('/users/me')
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 502,
        message: 'Request failed with status 502.',
        code: undefined,
      });
    });

    it('survives a JSON error body of an unexpected shape', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        json(500, { message: { nested: true }, code: 42 }),
      );

      const error = await setup(fetchMock)
        .get('/users/me')
        .catch((caught: unknown) => caught);

      expect(error).toMatchObject({
        status: 500,
        message: 'Request failed with status 500.',
        code: undefined,
      });
    });
  });

  describe('network failures', () => {
    it('reports an unreachable server as a NetworkError', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () => {
        throw new TypeError('Failed to fetch');
      });

      const error = await setup(fetchMock)
        .get('/users/me')
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(NetworkError);
      expect(error).toMatchObject({ reason: 'unreachable' });
    });

    it('aborts a request that exceeds the timeout', async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn<typeof fetch>(hangingFetch);

      const outcome = setup(fetchMock)
        .get('/users/me')
        .catch((caught: unknown) => caught);
      await vi.advanceTimersByTimeAsync(1_000);

      const error = await outcome;
      expect(error).toBeInstanceOf(NetworkError);
      expect(error).toMatchObject({ reason: 'timeout' });
      expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    });
  });

  describe('cancellation by the caller', () => {
    it('aborts the underlying request and rethrows the abort untouched', async () => {
      const fetchMock = vi.fn<typeof fetch>(hangingFetch);
      const controller = new AbortController();

      const outcome = setup(fetchMock)
        .get('/users/me', { signal: controller.signal })
        .catch((caught: unknown) => caught);
      controller.abort();

      const error = await outcome;
      expect(error).not.toBeInstanceOf(NetworkError);
      expect(error).toMatchObject({ name: 'AbortError' });
      expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    });

    it('does not start work for a signal that is already aborted', async () => {
      const fetchMock = vi.fn<typeof fetch>(hangingFetch);
      const controller = new AbortController();
      controller.abort();

      const error = await setup(fetchMock)
        .get('/users/me', { signal: controller.signal })
        .catch((caught: unknown) => caught);

      expect(error).toMatchObject({ name: 'AbortError' });
    });

    it('does not retry after the refresh when the caller has left', async () => {
      const controller = new AbortController();
      const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
        if (input === '/api/v1/auth/refresh') {
          controller.abort();
          return new Response(null, { status: 204 });
        }
        if (init?.signal?.aborted) throw init.signal.reason;
        return json(401, apiErrorBody(401));
      });

      const error = await setup(fetchMock)
        .get('/users/me', { signal: controller.signal })
        .catch((caught: unknown) => caught);

      expect(error).toMatchObject({ name: 'AbortError' });
    });
  });

  describe('expired access token (401)', () => {
    it('refreshes the session and sends the request again', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json(401, apiErrorBody(401)))
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(json(200, { id: '1' }));

      await expect(setup(fetchMock).get('/users/me')).resolves.toEqual({
        id: '1',
      });
      expect(calledUrls(fetchMock)).toEqual([
        '/api/v1/users/me',
        '/api/v1/auth/refresh',
        '/api/v1/users/me',
      ]);
      expect(fetchMock.mock.calls[1][1]?.method).toBe('POST');
    });

    it('shares one refresh between requests that fail together', async () => {
      let refreshed = false;
      let releaseRefresh = () => {};
      const fetchMock = vi.fn<typeof fetch>(async (input) => {
        if (input === '/api/v1/auth/refresh') {
          await new Promise<void>((resolve) => {
            releaseRefresh = resolve;
          });
          refreshed = true;
          return new Response(null, { status: 204 });
        }
        return refreshed
          ? json(200, { url: input })
          : json(401, apiErrorBody(401));
      });
      const client = setup(fetchMock);

      const all = Promise.all([
        client.get('/a'),
        client.get('/b'),
        client.get('/c'),
      ]);
      await vi.waitFor(() =>
        expect(calledUrls(fetchMock)).toContain('/api/v1/auth/refresh'),
      );
      // Let every request reach its 401 before the refresh completes.
      await Promise.resolve();
      releaseRefresh();

      await expect(all).resolves.toHaveLength(3);
      const refreshCalls = calledUrls(fetchMock).filter(
        (url) => url === '/api/v1/auth/refresh',
      );
      expect(refreshCalls).toHaveLength(1);
    });

    it('starts a new refresh for a later expiry', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json(401, apiErrorBody(401)))
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(json(200, {}))
        .mockResolvedValueOnce(json(401, apiErrorBody(401)))
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(json(200, {}));
      const client = setup(fetchMock);

      await client.get('/users/me');
      await client.get('/users/me');

      expect(fetchMock).toHaveBeenCalledTimes(6);
    });

    it('throws 401 when the session is really over, without looping', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        json(401, apiErrorBody(401, { message: 'Not signed in' })),
      );

      const error = await setup(fetchMock)
        .get('/users/me')
        .catch((caught: unknown) => caught);

      expect(error).toMatchObject({ status: 401, message: 'Not signed in' });
      expect(calledUrls(fetchMock)).toEqual([
        '/api/v1/users/me',
        '/api/v1/auth/refresh',
        '/api/v1/users/me',
      ]);
    });

    it('succeeds when another tab renewed the session first', async () => {
      // This tab's refresh loses the race (the token was already used), but
      // the browser now holds the cookies the other tab received.
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json(401, apiErrorBody(401)))
        .mockResolvedValueOnce(json(401, apiErrorBody(401)))
        .mockResolvedValueOnce(json(200, { id: '1' }));

      await expect(setup(fetchMock).get('/users/me')).resolves.toEqual({
        id: '1',
      });
    });

    it('reports a network failure during refresh as a network failure', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json(401, apiErrorBody(401)))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const error = await setup(fetchMock)
        .get('/users/me')
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(NetworkError);
    });

    it('retries only once: a second 401 is final', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json(401, apiErrorBody(401)))
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(json(401, apiErrorBody(401)));

      const error = await setup(fetchMock)
        .get('/users/me')
        .catch((caught: unknown) => caught);

      expect(error).toMatchObject({ status: 401 });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('does not refresh when the caller says a 401 is the answer', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        json(401, apiErrorBody(401, { message: 'Invalid credentials' })),
      );

      const error = await setup(fetchMock)
        .post('/auth/login', {}, { refreshOn401: false })
        .catch((caught: unknown) => caught);

      expect(error).toMatchObject({
        status: 401,
        message: 'Invalid credentials',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not refresh for other failures', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        json(403, apiErrorBody(403)),
      );

      await expect(setup(fetchMock).get('/users/me')).rejects.toMatchObject({
        status: 403,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});

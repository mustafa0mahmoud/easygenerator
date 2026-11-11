import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { createQueryClient } from '../lib/query/query-client.ts';
import { routes } from '../routes/routes.ts';

type Reply = { status: number; body?: unknown };
type Handler = Reply | ((body: unknown) => Reply | Promise<Reply>);

/** Routes keyed by "METHOD /path-after-/api/v1". */
export type ApiHandlers = Record<string, Handler>;

export const USER = { id: 'u1', email: 'sara@example.com', name: 'Sara' };

export const apiError = (
  statusCode: number,
  message: string,
  code?: string,
) => ({
  status: statusCode,
  body: {
    statusCode,
    error: 'Error',
    message,
    ...(code ? { code } : {}),
    requestId: 'req-1',
    timestamp: '2026-01-01T00:00:00.000Z',
    path: '/api/v1/x',
  },
});

export const SIGNED_OUT: ApiHandlers = {
  'GET /users/me': apiError(401, 'Authentication required.'),
  'POST /auth/refresh': apiError(401, 'Session expired. Please sign in again.'),
};

export const SIGNED_IN: ApiHandlers = {
  'GET /users/me': { status: 200, body: USER },
};

/**
 * Replaces `fetch` with a small fake API, so the tests drive the real pages,
 * router, guards, forms and HTTP client together. An unexpected request
 * fails the test instead of being silently answered.
 */
export function mockApi(handlers: ApiHandlers) {
  const calls: { key: string; body: unknown }[] = [];

  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const key = `${init?.method ?? 'GET'} ${String(input).replace('/api/v1', '')}`;
    const body: unknown =
      typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ key, body });

    const handler = handlers[key];
    if (!handler) throw new Error(`Unexpected request in test: ${key}`);
    const reply = typeof handler === 'function' ? await handler(body) : handler;
    return new Response(
      reply.body === undefined ? null : JSON.stringify(reply.body),
      { status: reply.status },
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    calls,
    bodiesOf: (key: string) =>
      calls.filter((call) => call.key === key).map((call) => call.body),
  };
}

export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, user: userEvent.setup() };
}

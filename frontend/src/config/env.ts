/**
 * Application settings. The API is always called on the page's own origin:
 * the dev server and nginx both forward `/api` to the backend, so the session
 * cookies stay first-party and no CORS setup exists to get wrong.
 */
export const env = {
  apiBaseUrl: '/api/v1',
  /** A request with no answer after this long is reported as a timeout. */
  requestTimeoutMs: 15_000,
} as const;

/** The one shape every error response has. */
export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  /** Machine-readable reason, present only when the thrower supplied one. */
  code?: string;
  requestId?: string;
  timestamp: string;
  path: string;
}

/** The parts of an incoming request the exception filter reads. */
export interface RequestLike {
  id?: unknown;
  /** Full path as received. `url` is rewritten by the router while matching. */
  originalUrl?: string;
  url?: string;
}

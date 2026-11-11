export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  code?: string;
  requestId?: string;
  timestamp: string;
  path: string;
}

export interface RequestLike {
  id?: unknown;
  /** Full path as received. `url` is rewritten by the router while matching. */
  originalUrl?: string;
  url?: string;
}

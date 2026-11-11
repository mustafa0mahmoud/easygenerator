export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type NetworkFailureReason = 'unreachable' | 'timeout';

export interface ApiErrorInit {
  status: number;
  message: string;
  details?: readonly string[];
  code?: string;
  requestId?: string;
}

export interface RequestOptions {
  method?: HttpMethod;
  /** Sent as JSON. */
  body?: unknown;
  /** Lets the caller cancel: a page that unmounts, a query that is replaced. */
  signal?: AbortSignal;
  timeoutMs?: number;
  /**
   * Whether a 401 means "the access token expired, renew it and try again".
   * Set to `false` where a 401 is the real answer, such as a wrong password.
   */
  refreshOn401?: boolean;
}

export interface HttpClientConfig {
  baseUrl: string;
  timeoutMs: number;
  /** The endpoint that trades the refresh cookie for a new access cookie. */
  refreshPath: string;
  /** Replaceable in tests. */
  fetch?: typeof fetch;
}

export interface HttpClient {
  request<T = void>(path: string, options?: RequestOptions): Promise<T>;
  get<T>(
    path: string,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T>;
  post<T = void>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T>;
}

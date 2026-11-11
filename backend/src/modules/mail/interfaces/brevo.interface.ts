export interface BrevoTransportOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface BrevoContact {
  email: string;
  name?: string;
}

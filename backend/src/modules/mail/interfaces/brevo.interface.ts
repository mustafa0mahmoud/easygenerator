export interface BrevoTransportOptions {
  apiKey: string;
  baseUrl?: string;
  /** Per-attempt timeout. Retries are handled by the mailer. */
  timeoutMs?: number;
}

/** A sender or recipient as Brevo's API expects it. */
export interface BrevoContact {
  email: string;
  name?: string;
}

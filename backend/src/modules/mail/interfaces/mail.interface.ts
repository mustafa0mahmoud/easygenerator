import type { Env } from '../../../config/env.validation.js';

/** The settings the mail transport is chosen from. */
export type MailEnv = Pick<Env, 'MAIL_DRIVER' | 'BREVO_API_KEY'>;

/** What every email that carries a one-time code is rendered from. */
export interface CodeMailData {
  name: string;
  code: string;
  expiresInMinutes: number;
}

/** What a delivery failure can safely say in a log. */
export interface MailErrorSummary {
  errorName: string;
  /** Whether sending the same message again could succeed. */
  permanent?: boolean;
  /** HTTP status of the provider's answer, or the SMTP reply code. */
  status?: number;
  provider?: string;
  providerCode?: string;
}

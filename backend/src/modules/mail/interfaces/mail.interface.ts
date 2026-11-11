import type { Env } from '../../../config/env.validation.js';

export type MailEnv = Pick<Env, 'MAIL_DRIVER' | 'BREVO_API_KEY'>;

export interface CodeMailData {
  name: string;
  code: string;
  expiresInMinutes: number;
}

export interface MailErrorSummary {
  errorName: string;
  permanent?: boolean;
  status?: number;
  provider?: string;
  providerCode?: string;
}

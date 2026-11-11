import { MailError, MailProviderError } from '@nestjs/mail';
import type { MailErrorSummary } from './interfaces/mail.interface.js';

/**
 * What a delivery failure can safely say in a log: the kind of error and the
 * provider's status, which is enough to tell a bad API key (401) from a
 * rejected sender (400) or an outage (5xx). The error message is left out on
 * purpose, because providers echo the recipient's address in it.
 */
export function summarizeMailError(error: unknown): MailErrorSummary {
  if (!(error instanceof Error)) {
    return { errorName: 'UnknownError' };
  }

  const summary: MailErrorSummary = { errorName: error.name };
  if (error instanceof MailError) {
    summary.permanent = error.permanent;
    summary.status = error.code;
  }
  if (error instanceof MailProviderError) {
    summary.provider = error.provider;
    summary.providerCode = error.providerCode;
  }
  return summary;
}

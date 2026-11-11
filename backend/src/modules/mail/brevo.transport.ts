import {
  MailProviderError,
  MailTransport,
  type MailAddress,
  type MailMessage,
  type MailTransportResult,
  type MailTransportSendOptions,
} from '@nestjs/mail';
import type {
  BrevoContact,
  BrevoTransportOptions,
} from './interfaces/brevo.interface.js';

const PROVIDER = 'brevo';
const DEFAULT_BASE_URL = 'https://api.brevo.com';
const DEFAULT_TIMEOUT_MS = 10_000;
const MS_PER_SECOND = 1000;

function toContact({ address, name }: MailAddress): BrevoContact {
  return name ? { email: address, name } : { email: address };
}

/**
 * Sends transactional email through Brevo's HTTPS API (no SMTP port needed,
 * which matters on hosts that block outbound SMTP).
 *
 * Only what this application sends is mapped: sender, recipients, subject and
 * the HTML/text bodies. The API key lives in a private field and is never part
 * of an error or a log line.
 */
export class BrevoTransport extends MailTransport {
  readonly #apiKey: string;
  private readonly url: string;
  private readonly timeoutMs: number;

  constructor({
    apiKey,
    baseUrl = DEFAULT_BASE_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: BrevoTransportOptions) {
    super();
    this.#apiKey = apiKey;
    this.url = `${baseUrl}/v3/smtp/email`;
    this.timeoutMs = timeoutMs;
  }

  async send(
    message: MailMessage,
    { signal }: MailTransportSendOptions,
  ): Promise<MailTransportResult> {
    // A network error or a timeout rejects here and is treated as transient,
    // so the mailer retries it with backoff.
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'api-key': this.#apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: toContact(message.from),
        to: message.to.map(toContact),
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]),
    });

    if (!response.ok) {
      throw await this.toError(response);
    }

    const body = (await response.json().catch(() => ({}))) as {
      messageId?: unknown;
    };
    return {
      accepted: message.envelope.to,
      providerMessageId:
        typeof body.messageId === 'string' ? body.messageId : undefined,
    };
  }

  /** 4xx (except 408/409/429) is permanent; 5xx and rate limits are retried. */
  private async toError(response: Response): Promise<MailProviderError> {
    const body = (await response.json().catch(() => ({}))) as {
      code?: unknown;
      message?: unknown;
    };
    const retryAfterSeconds = Number(response.headers.get('retry-after'));

    return new MailProviderError({
      provider: PROVIDER,
      status: response.status,
      providerCode: typeof body.code === 'string' ? body.code : undefined,
      detail: typeof body.message === 'string' ? body.message : undefined,
      ...(retryAfterSeconds > 0 && {
        retryAfterMs: retryAfterSeconds * MS_PER_SECOND,
      }),
    });
  }
}

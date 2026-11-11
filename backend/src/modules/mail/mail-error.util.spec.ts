import { MailProviderError } from '@nestjs/mail';
import { summarizeMailError } from './mail-error.util.js';

describe('summarizeMailError', () => {
  it('reports the provider, status and retryability of a provider rejection', () => {
    const error = new MailProviderError({
      provider: 'brevo',
      status: 401,
      providerCode: 'unauthorized',
      detail: 'Key not found',
    });

    expect(summarizeMailError(error)).toEqual({
      errorName: error.name,
      permanent: true,
      status: 401,
      provider: 'brevo',
      providerCode: 'unauthorized',
    });
  });

  it('marks a provider outage as retryable', () => {
    const error = new MailProviderError({ provider: 'brevo', status: 503 });

    expect(summarizeMailError(error)).toMatchObject({
      status: 503,
      permanent: false,
    });
  });

  it('never includes the error message, which can contain the recipient address', () => {
    const error = new MailProviderError({
      provider: 'brevo',
      status: 400,
      detail: 'recipient sara@example.com is blocked',
    });

    expect(JSON.stringify(summarizeMailError(error))).not.toContain(
      'sara@example.com',
    );
  });

  it('reports only the name of an ordinary error such as a network failure', () => {
    expect(
      summarizeMailError(new TypeError('fetch failed for sara@example.com')),
    ).toEqual({
      errorName: 'TypeError',
    });
  });

  it('handles a thrown value that is not an Error', () => {
    expect(summarizeMailError('boom')).toEqual({ errorName: 'UnknownError' });
  });
});

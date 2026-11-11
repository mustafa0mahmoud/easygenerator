import { MailProviderError, type MailMessage } from '@nestjs/mail';
import { BrevoTransport } from './brevo.transport.js';

const API_KEY = 'xkeysib-secret-test-key';

/** The parts of a validated message the transport reads. */
const fields = {
  from: { name: 'Auth Task', address: 'sender@example.com' },
  to: [{ name: 'Easygenerator', address: 'easygenerator@example.com' }],
  subject: 'Your verification code',
  html: '<p>123456</p>',
  text: '123456',
  envelope: { from: 'sender@example.com', to: ['easygenerator@example.com'] },
};
const message = fields as unknown as MailMessage;

function sendOptions(signal: AbortSignal = new AbortController().signal) {
  return { signal, attempt: 1 };
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('BrevoTransport', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the message to the Brevo transactional endpoint', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, { messageId: '<abc@relay>' }),
    );
    const transport = new BrevoTransport({ apiKey: API_KEY });

    const result = await transport.send(message, sendOptions());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'api-key': API_KEY,
      'content-type': 'application/json',
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      sender: { name: 'Auth Task', email: 'sender@example.com' },
      to: [{ name: 'Easygenerator', email: 'easygenerator@example.com' }],
      subject: 'Your verification code',
      htmlContent: '<p>123456</p>',
      textContent: '123456',
    });
    expect(result).toEqual({
      accepted: ['easygenerator@example.com'],
      providerMessageId: '<abc@relay>',
    });
  });

  it('omits the display name when a recipient has none', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, {}));
    const transport = new BrevoTransport({ apiKey: API_KEY });
    const anonymous = {
      ...fields,
      to: [{ address: 'x@example.com' }],
    } as unknown as MailMessage;

    await transport.send(anonymous, sendOptions());

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
      to: unknown;
    };
    expect(body.to).toEqual([{ email: 'x@example.com' }]);
  });

  it('reports a rejected request as a permanent provider error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { code: 'unauthorized', message: 'Key not found' }),
    );
    const transport = new BrevoTransport({ apiKey: API_KEY });

    const error = await transport
      .send(message, sendOptions())
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MailProviderError);
    expect(error).toMatchObject({
      provider: 'brevo',
      code: 401,
      providerCode: 'unauthorized',
      permanent: true,
    });
  });

  it('reports a server error as retryable', async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, { message: 'unavailable' }));
    const transport = new BrevoTransport({ apiKey: API_KEY });

    const error = await transport
      .send(message, sendOptions())
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 503, permanent: false });
  });

  it('keeps the provider retry delay on a rate-limit response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, {}, { 'retry-after': '7' }));
    const transport = new BrevoTransport({ apiKey: API_KEY });

    const error = await transport
      .send(message, sendOptions())
      .catch((e: unknown) => e);

    expect(error).toMatchObject({
      code: 429,
      permanent: false,
      retryAfterMs: 7000,
    });
  });

  it('handles an error response that is not JSON', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>Bad gateway</html>', { status: 502 }),
    );
    const transport = new BrevoTransport({ apiKey: API_KEY });

    const error = await transport
      .send(message, sendOptions())
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MailProviderError);
    expect(error).toMatchObject({ code: 502 });
  });

  it('lets a network failure through so the mailer can retry it', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const transport = new BrevoTransport({ apiKey: API_KEY });

    await expect(transport.send(message, sendOptions())).rejects.toThrow(
      'fetch failed',
    );
  });

  it('aborts a request that exceeds the timeout', async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason as Error),
          );
        }),
    );
    const transport = new BrevoTransport({ apiKey: API_KEY, timeoutMs: 20 });

    await expect(transport.send(message, sendOptions())).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('stops when the caller cancels', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason as Error),
          );
        }),
    );
    const transport = new BrevoTransport({ apiKey: API_KEY });

    const pending = transport.send(message, sendOptions(controller.signal));
    controller.abort(new Error('cancelled by caller'));

    await expect(pending).rejects.toThrow('cancelled by caller');
  });

  it('never exposes the API key in an error or when the transport is serialised', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { code: 'unauthorized', message: 'Key not found' }),
    );
    const transport = new BrevoTransport({ apiKey: API_KEY });

    const error = (await transport
      .send(message, sendOptions())
      .catch((e: unknown) => e)) as Error;

    expect(
      `${error.message} ${error.stack} ${JSON.stringify(error)}`,
    ).not.toContain(API_KEY);
    expect(JSON.stringify(transport)).not.toContain(API_KEY);
    expect(Object.values(transport)).not.toContain(API_KEY);
  });
});

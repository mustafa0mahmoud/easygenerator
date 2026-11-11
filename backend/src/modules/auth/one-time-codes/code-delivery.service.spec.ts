import { Logger } from '@nestjs/common';
import { MailProviderError, type Mailer } from '@nestjs/mail';
import { PasswordResetCodeMail } from '../../mail/mails/password-reset-code.mail.js';
import { VerificationCodeMail } from '../../mail/mails/verification-code.mail.js';
import type { UserRecord } from '../../users/interfaces/user.interface.js';
import { CodeDeliveryService } from './code-delivery.service.js';

const EMAIL = 'sara@example.com';
const CODE = '482913';
const user: UserRecord = {
  id: 'user-1',
  email: EMAIL,
  name: 'Sara',
  emailVerifiedAt: null,
  createdAt: new Date('2026-01-01'),
};

function setup() {
  const mailer = { send: vi.fn().mockResolvedValue({ attempts: 1 }) };
  const service = new CodeDeliveryService(mailer as unknown as Mailer);
  return { service, mailer };
}

/** Everything written to the logger during a test. */
function captureLogs() {
  const calls: { level: string; payload: Record<string, unknown> }[] = [];
  for (const level of ['debug', 'log', 'warn', 'error'] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(
      (payload: Record<string, unknown>) => {
        calls.push({ level, payload });
      },
    );
  }
  return calls;
}

describe('CodeDeliveryService', () => {
  let logs: ReturnType<typeof captureLogs>;

  beforeEach(() => {
    logs = captureLogs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['email_verification', VerificationCodeMail],
    ['password_reset', PasswordResetCodeMail],
  ] as const)(
    'sends the %s code with the email for that purpose',
    (purpose, mailClass) => {
      const { service, mailer } = setup();

      service.deliverInBackground(purpose, user, CODE);

      expect(mailer.send).toHaveBeenCalledExactlyOnceWith(mailClass, {
        to: { name: 'Sara', address: EMAIL },
        data: { name: 'Sara', code: CODE, expiresInMinutes: 5 },
      });
    },
  );

  it('returns before the mail provider answers', () => {
    const { service, mailer } = setup();
    mailer.send.mockReturnValue(new Promise(() => undefined)); // never settles

    // A synchronous return is the guarantee: nothing here can be awaited.
    expect(
      service.deliverInBackground('email_verification', user, CODE),
    ).toBeUndefined();
  });

  it.each([
    ['email_verification', 'verification_email'],
    ['password_reset', 'password_reset_email'],
  ] as const)(
    'logs the %s delivery as queued, then sent',
    async (purpose, logName) => {
      const { service } = setup();

      service.deliverInBackground(purpose, user, CODE);

      await vi.waitFor(() =>
        expect(
          logs.map(({ payload }) => payload.step ?? payload.event),
        ).toEqual([`${logName}.queued`, `${logName}_sent`]),
      );
      expect(logs[1]).toMatchObject({
        level: 'log',
        payload: { userId: 'user-1', attempts: 1 },
      });
    },
  );

  it('does not throw when delivery fails, and logs why', async () => {
    const { service, mailer } = setup();
    mailer.send.mockRejectedValue(
      new MailProviderError({
        provider: 'brevo',
        status: 401,
        providerCode: 'unauthorized',
        detail: `rejected ${EMAIL}`,
      }),
    );

    expect(() =>
      service.deliverInBackground('password_reset', user, CODE),
    ).not.toThrow();

    await vi.waitFor(() => expect(logs).toHaveLength(2));
    expect(logs[1]).toMatchObject({
      level: 'error',
      payload: {
        event: 'password_reset_email_failed',
        userId: 'user-1',
        provider: 'brevo',
        status: 401,
        providerCode: 'unauthorized',
        permanent: true,
      },
    });
  });

  it('never writes the code or the address to the logs, on success or failure', async () => {
    const { service, mailer } = setup();

    service.deliverInBackground('email_verification', user, CODE);
    mailer.send.mockRejectedValue(new Error(`provider rejected ${EMAIL}`));
    service.deliverInBackground('email_verification', user, CODE);

    await vi.waitFor(() => expect(logs).toHaveLength(4));
    const written = JSON.stringify(logs);
    expect(written).toContain('user-1');
    expect(written).not.toContain(EMAIL);
    expect(written).not.toContain(CODE);
  });
});

import { BadRequestException, Logger } from '@nestjs/common';
import type { PasswordHasher } from '@nestjs/authentication';
import type { Mailer } from '@nestjs/mail';
import { CodeDeliveryService } from '../one-time-codes/code-delivery.service.js';
import { PasswordResetCodeMail } from '../../mail/mails/password-reset-code.mail.js';
import type { UserRecord } from '../../users/interfaces/user.interface.js';
import type { UsersRepository } from '../../users/users.repository.js';
import { AUTH_MESSAGES } from '../auth.constants.js';
import type { OneTimeCodesService } from '../one-time-codes/one-time-codes.service.js';
import type { SessionsService } from '../sessions/sessions.service.js';
import { PasswordResetService } from './password-reset.service.js';

const EMAIL = 'user@example.com';
const NEW_PASSWORD = 'N3w-Passw0rd!';
const CODE = '482913';
const NEW_HASH = '$scrypt$hash-of-new-password';

const verified: UserRecord = {
  id: 'user-1',
  email: EMAIL,
  name: 'Sara',
  emailVerifiedAt: new Date('2026-01-01'),
};
const unverified: UserRecord = { ...verified, emailVerifiedAt: null };

function setup() {
  const users = {
    findByEmail: vi
      .fn<UsersRepository['findByEmail']>()
      .mockResolvedValue(verified),
    updatePasswordHash: vi
      .fn<UsersRepository['updatePasswordHash']>()
      .mockResolvedValue(true),
    markEmailVerified: vi
      .fn<UsersRepository['markEmailVerified']>()
      .mockResolvedValue(false),
  };
  const codes = {
    issue: vi
      .fn<OneTimeCodesService['issue']>()
      .mockResolvedValue({ code: CODE, expiresAt: new Date() }),
    isInCooldown: vi
      .fn<OneTimeCodesService['isInCooldown']>()
      .mockResolvedValue(false),
    verify: vi.fn<OneTimeCodesService['verify']>().mockResolvedValue(true),
    invalidate: vi
      .fn<OneTimeCodesService['invalidate']>()
      .mockResolvedValue(undefined),
  };
  const hasher = {
    hash: vi.fn<PasswordHasher['hash']>().mockResolvedValue(NEW_HASH),
  };
  const mailer = { send: vi.fn().mockResolvedValue({ attempts: 1 }) };
  const sessions = {
    revokeAllForUser: vi
      .fn<SessionsService['revokeAllForUser']>()
      .mockResolvedValue(2),
  };

  const service = new PasswordResetService(
    users as unknown as UsersRepository,
    codes as unknown as OneTimeCodesService,
    hasher as unknown as PasswordHasher,
    // The real delivery service around a mocked mailer, so these tests still
    // assert on what is actually handed to the mail provider.
    new CodeDeliveryService(mailer as unknown as Mailer),
    sessions as unknown as SessionsService,
  );
  return { service, users, codes, hasher, mailer, sessions };
}

function captureLogs() {
  const calls: unknown[][] = [];
  for (const level of ['debug', 'log', 'warn', 'error'] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(
      (...args: unknown[]) => {
        calls.push(args);
      },
    );
  }
  return () => JSON.stringify(calls);
}

describe('PasswordResetService', () => {
  let logs: () => string;

  beforeEach(() => {
    logs = captureLogs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('request', () => {
    const dto = { email: EMAIL };

    it('issues a reset code and emails it', async () => {
      const { service, codes, mailer } = setup();

      await service.request(dto);

      expect(codes.issue).toHaveBeenCalledWith('user-1', 'password_reset');
      expect(mailer.send).toHaveBeenCalledWith(PasswordResetCodeMail, {
        to: { name: 'Sara', address: EMAIL },
        data: { name: 'Sara', code: CODE, expiresInMinutes: 5 },
      });
    });

    it('also works for an account that was never verified', async () => {
      const { service, users, codes } = setup();
      users.findByEmail.mockResolvedValue(unverified);

      await service.request(dto);

      expect(codes.issue).toHaveBeenCalledWith('user-1', 'password_reset');
    });

    it('silently does nothing for an unknown address', async () => {
      const { service, users, codes, mailer } = setup();
      users.findByEmail.mockResolvedValue(null);

      await expect(service.request(dto)).resolves.toBeUndefined();

      expect(codes.issue).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('silently does nothing during the per-address cooldown', async () => {
      const { service, codes, mailer } = setup();
      codes.isInCooldown.mockResolvedValue(true);

      await expect(service.request(dto)).resolves.toBeUndefined();

      expect(codes.isInCooldown).toHaveBeenCalledWith(
        'user-1',
        'password_reset',
      );
      expect(codes.issue).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('succeeds even when the email cannot be delivered', async () => {
      const { service, mailer } = setup();
      mailer.send.mockRejectedValue(new Error(`provider rejected ${EMAIL}`));

      await expect(service.request(dto)).resolves.toBeUndefined();
      await vi.waitFor(() =>
        expect(logs()).toContain('password_reset_email_failed'),
      );
    });

    it('does not wait for the mail provider before returning', async () => {
      const { service, mailer } = setup();
      mailer.send.mockReturnValue(new Promise(() => undefined)); // never settles

      await expect(service.request(dto)).resolves.toBeUndefined();
    });
  });

  describe('reset', () => {
    const dto = { email: EMAIL, code: CODE, password: NEW_PASSWORD };

    it('stores the new password as a hash when the code is correct', async () => {
      const { service, users, codes, hasher } = setup();

      await service.reset(dto);

      expect(codes.verify).toHaveBeenCalledWith(
        'user-1',
        'password_reset',
        CODE,
      );
      expect(hasher.hash).toHaveBeenCalledWith(NEW_PASSWORD);
      expect(users.updatePasswordHash).toHaveBeenCalledWith('user-1', NEW_HASH);
      expect(JSON.stringify(users.updatePasswordHash.mock.calls)).not.toContain(
        NEW_PASSWORD,
      );
    });

    it('ends every session of the account', async () => {
      const { service, sessions } = setup();

      await service.reset(dto);

      expect(sessions.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });

    it('marks the address as verified and drops any pending verification code', async () => {
      const { service, users, codes } = setup();
      users.findByEmail.mockResolvedValue(unverified);
      users.markEmailVerified.mockResolvedValue(true);

      await service.reset(dto);

      expect(users.markEmailVerified).toHaveBeenCalledWith(
        'user-1',
        expect.any(Date),
      );
      expect(codes.invalidate).toHaveBeenCalledWith(
        'user-1',
        'email_verification',
      );
    });

    it.each([
      ['the address is unknown', null, true],
      ['the code is wrong, expired or exhausted', verified, false],
    ])(
      'returns the same error when %s, and changes nothing',
      async (_label, user, codeIsValid) => {
        const { service, users, codes, hasher, sessions } = setup();
        users.findByEmail.mockResolvedValue(user);
        codes.verify.mockResolvedValue(codeIsValid);

        const attempt = service.reset(dto);

        await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
        await expect(attempt).rejects.toThrow(AUTH_MESSAGES.invalidResetCode);
        expect(hasher.hash).not.toHaveBeenCalled();
        expect(users.updatePasswordHash).not.toHaveBeenCalled();
        expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
      },
    );

    it('does not pay for a hash until the code is confirmed', async () => {
      const { service, codes, hasher } = setup();
      const order: string[] = [];
      codes.verify.mockImplementation(() => {
        order.push('verify');
        return Promise.resolve(true);
      });
      hasher.hash.mockImplementation(() => {
        order.push('hash');
        return Promise.resolve(NEW_HASH);
      });

      await service.reset(dto);

      expect(order).toEqual(['verify', 'hash']);
    });

    it('changes the password before ending the sessions', async () => {
      const { service, users, sessions } = setup();
      const order: string[] = [];
      users.updatePasswordHash.mockImplementation(() => {
        order.push('password');
        return Promise.resolve(true);
      });
      sessions.revokeAllForUser.mockImplementation(() => {
        order.push('sessions');
        return Promise.resolve(1);
      });

      await service.reset(dto);

      // The other order would let a signed-in attacker refresh in between.
      expect(order).toEqual(['password', 'sessions']);
    });

    it('propagates a database failure instead of reporting success', async () => {
      const { service, users, sessions } = setup();
      users.updatePasswordHash.mockRejectedValue(new Error('connection lost'));

      await expect(service.reset(dto)).rejects.toThrow('connection lost');
      expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('keeps the email, password, hash and code out of the logs', async () => {
      const { service, codes } = setup();

      await service.reset(dto);
      codes.verify.mockResolvedValue(false);
      await expect(service.reset(dto)).rejects.toThrow();

      expect(logs()).toContain('password_reset_failed');
      expect(logs()).toContain('user-1');
      for (const secret of [EMAIL, NEW_PASSWORD, NEW_HASH, CODE]) {
        expect(logs()).not.toContain(secret);
      }
    });
  });
});

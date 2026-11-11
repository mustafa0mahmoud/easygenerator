import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { PasswordHasher } from '@nestjs/authentication';
import type { Mailer } from '@nestjs/mail';
import { CodeDeliveryService } from './one-time-codes/code-delivery.service.js';
import { VerificationCodeMail } from '../mail/mails/verification-code.mail.js';
import type {
  UserCredentials,
  UserRecord,
} from '../users/interfaces/user.interface.js';
import type { UsersRepository } from '../users/users.repository.js';
import { AUTH_MESSAGES } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import type { OneTimeCodesService } from './one-time-codes/one-time-codes.service.js';
import type { SessionsService } from './sessions/sessions.service.js';

const EMAIL = 'user@example.com';
const PASSWORD = 'Passw0rd!';
const CODE = '482913';
const HASH = '$scrypt$hash-of-password';

const unverified: UserRecord = {
  id: 'user-1',
  email: EMAIL,
  name: 'Sara',
  emailVerifiedAt: null,
};
const verified: UserRecord = {
  ...unverified,
  emailVerifiedAt: new Date('2026-01-01'),
};
const verifiedAccount: UserCredentials = { ...verified, passwordHash: HASH };
const unverifiedAccount: UserCredentials = {
  ...unverified,
  passwordHash: HASH,
};
const TOKENS = {
  accessToken: 'access.jwt.value',
  refreshToken: 'refresh-opaque-value',
};

function setup() {
  const users = {
    findByEmail: vi
      .fn<UsersRepository['findByEmail']>()
      .mockResolvedValue(null),
    createUnverified: vi
      .fn<UsersRepository['createUnverified']>()
      .mockResolvedValue(unverified),
    markEmailVerified: vi
      .fn<UsersRepository['markEmailVerified']>()
      .mockResolvedValue(true),
    findById: vi.fn<UsersRepository['findById']>().mockResolvedValue(verified),
    findCredentialsByEmail: vi
      .fn<UsersRepository['findCredentialsByEmail']>()
      .mockResolvedValue(verifiedAccount),
    updatePasswordHash: vi
      .fn<UsersRepository['updatePasswordHash']>()
      .mockResolvedValue(true),
  };
  const sessions = {
    issue: vi.fn<SessionsService['issue']>().mockResolvedValue(TOKENS),
    rotate: vi
      .fn<SessionsService['rotate']>()
      .mockResolvedValue({ userId: 'user-1', tokens: TOKENS }),
    revoke: vi.fn<SessionsService['revoke']>().mockResolvedValue(true),
  };
  const codes = {
    issue: vi
      .fn<OneTimeCodesService['issue']>()
      .mockResolvedValue({ code: CODE, expiresAt: new Date() }),
    isInCooldown: vi
      .fn<OneTimeCodesService['isInCooldown']>()
      .mockResolvedValue(false),
    verify: vi.fn<OneTimeCodesService['verify']>().mockResolvedValue(true),
  };
  const hasher = {
    hash: vi.fn<PasswordHasher['hash']>().mockResolvedValue(HASH),
    verify: vi.fn<PasswordHasher['verify']>().mockResolvedValue(true),
    needsRehash: vi.fn<PasswordHasher['needsRehash']>().mockReturnValue(false),
  };
  const mailer = { send: vi.fn().mockResolvedValue({ attempts: 1 }) };

  const service = new AuthService(
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

/** Everything written to the logger during a test, as one searchable string. */
function captureLogs() {
  const calls: unknown[][] = [];
  for (const level of ['debug', 'log', 'warn', 'error'] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(
      (...args: unknown[]) => {
        calls.push(args);
      },
    );
  }
  const text = () => JSON.stringify(calls);
  /** Names of the debug steps, in the order they were logged. */
  text.steps = () =>
    calls
      .map(([payload]) => (payload as { step?: string }).step)
      .filter((step): step is string => typeof step === 'string');
  return text;
}

describe('AuthService', () => {
  let logs: ReturnType<typeof captureLogs>;

  beforeEach(() => {
    logs = captureLogs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('signUp', () => {
    const dto = { email: EMAIL, name: 'Sara', password: PASSWORD };

    it('creates an unverified user with a hashed password and emails a code', async () => {
      const { service, users, codes, mailer } = setup();

      await service.signUp(dto);

      expect(users.createUnverified).toHaveBeenCalledWith({
        email: EMAIL,
        name: 'Sara',
        passwordHash: HASH,
      });
      expect(codes.issue).toHaveBeenCalledWith('user-1', 'email_verification');
      expect(mailer.send).toHaveBeenCalledWith(VerificationCodeMail, {
        to: { name: 'Sara', address: EMAIL },
        data: { name: 'Sara', code: CODE, expiresInMinutes: 5 },
      });
    });

    it('never stores or forwards the plain password', async () => {
      const { service, users } = setup();

      await service.signUp(dto);

      expect(JSON.stringify(users.createUnverified.mock.calls)).not.toContain(
        PASSWORD,
      );
    });

    it.each([
      ['a verified account', verified],
      ['an account that was never verified', unverified],
    ])(
      'rejects an address that belongs to %s, without touching it',
      async (_label, account) => {
        const { service, users, codes, mailer, hasher } = setup();
        users.findByEmail.mockResolvedValue(account);

        const attempt = service.signUp(dto);

        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(attempt).rejects.toThrow(AUTH_MESSAGES.emailTaken);
        expect(users.createUnverified).not.toHaveBeenCalled();
        expect(codes.issue).not.toHaveBeenCalled();
        expect(mailer.send).not.toHaveBeenCalled();
        // Refused before the expensive step.
        expect(hasher.hash).not.toHaveBeenCalled();
      },
    );

    it('rejects the loser of a creation race with the same conflict', async () => {
      const { service, users, codes, mailer } = setup();
      // Free at check time, but the unique index rejected the insert:
      // another request registered the address in between.
      users.findByEmail.mockResolvedValue(null);
      users.createUnverified.mockResolvedValue(null);

      await expect(service.signUp(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(codes.issue).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('succeeds even when the email cannot be delivered', async () => {
      const { service, mailer } = setup();
      mailer.send.mockRejectedValue(new Error('provider rejected ' + EMAIL));

      await expect(service.signUp(dto)).resolves.toBeUndefined();
      await vi.waitFor(() =>
        expect(logs()).toContain('verification_email_failed'),
      );
    });

    it('does not wait for the mail provider before returning', async () => {
      const { service, mailer } = setup();
      mailer.send.mockReturnValue(new Promise(() => undefined)); // never settles

      await expect(service.signUp(dto)).resolves.toBeUndefined();
    });

    it('propagates a database failure instead of pretending success', async () => {
      const { service, users } = setup();
      users.createUnverified.mockRejectedValue(new Error('connection lost'));

      await expect(service.signUp(dto)).rejects.toThrow('connection lost');
    });

    it('traces a new sign-up step by step, in order', async () => {
      const { service } = setup();

      await service.signUp(dto);

      expect(logs.steps()).toEqual([
        'signup.started',
        'signup.availability_checked',
        'signup.password_hashed',
        'signup.create_attempted',
        'verification_email.queued',
        'signup.completed',
      ]);
    });

    it('traces where a rejected sign-up stopped', async () => {
      const { service, users } = setup();
      users.findByEmail.mockResolvedValue(verified);

      await expect(service.signUp(dto)).rejects.toThrow();

      expect(logs.steps()).toEqual([
        'signup.started',
        'signup.availability_checked',
      ]);
      expect(logs()).toContain('signup_rejected_email_taken');
    });

    it('keeps the email, password and code out of the logs', async () => {
      const { service, mailer } = setup();
      mailer.send.mockRejectedValue(new Error('provider rejected ' + EMAIL));

      await service.signUp(dto);
      await vi.waitFor(() =>
        expect(logs()).toContain('verification_email_failed'),
      );

      expect(logs()).toContain('user-1');
      expect(logs()).not.toContain(EMAIL);
      expect(logs()).not.toContain(PASSWORD);
      expect(logs()).not.toContain(CODE);
      expect(logs()).not.toContain(HASH);
    });
  });

  describe('verifyEmail', () => {
    const dto = { email: EMAIL, code: CODE };

    it('marks the account verified when the code is correct', async () => {
      const { service, users, codes } = setup();
      users.findByEmail.mockResolvedValue(unverified);

      await service.verifyEmail(dto);

      expect(codes.verify).toHaveBeenCalledWith(
        'user-1',
        'email_verification',
        CODE,
      );
      expect(users.markEmailVerified).toHaveBeenCalledWith(
        'user-1',
        expect.any(Date),
      );
    });

    it.each([
      ['the address is unknown', null, true],
      ['the account is already verified', verified, true],
      ['the code is wrong, expired or exhausted', unverified, false],
    ])('returns the same error when %s', async (_label, user, codeIsValid) => {
      const { service, users, codes } = setup();
      users.findByEmail.mockResolvedValue(user);
      codes.verify.mockResolvedValue(codeIsValid);

      const attempt = service.verifyEmail(dto);

      await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
      await expect(attempt).rejects.toThrow(AUTH_MESSAGES.invalidCode);
      expect(users.markEmailVerified).not.toHaveBeenCalled();
    });

    it('does not spend a code attempt on an unknown or verified address', async () => {
      const { service, users, codes } = setup();
      users.findByEmail.mockResolvedValue(verified);

      await expect(service.verifyEmail(dto)).rejects.toThrow();

      expect(codes.verify).not.toHaveBeenCalled();
    });

    it('traces a successful verification step by step', async () => {
      const { service, users } = setup();
      users.findByEmail.mockResolvedValue(unverified);

      await service.verifyEmail(dto);

      expect(logs.steps()).toEqual([
        'verify_email.started',
        'verify_email.user_loaded',
        'verify_email.marked',
      ]);
    });

    it('keeps the email and the submitted code out of the logs', async () => {
      const { service, users, codes } = setup();
      users.findByEmail.mockResolvedValue(unverified);
      codes.verify.mockResolvedValue(false);

      await expect(service.verifyEmail(dto)).rejects.toThrow();

      expect(logs()).toContain('email_verification_failed');
      expect(logs()).not.toContain(EMAIL);
      expect(logs()).not.toContain(CODE);
    });
  });

  describe('resendVerification', () => {
    const dto = { email: EMAIL };

    it('sends a new code to an unverified account', async () => {
      const { service, users, codes, mailer } = setup();
      users.findByEmail.mockResolvedValue(unverified);

      await service.resendVerification(dto);

      expect(codes.issue).toHaveBeenCalledWith('user-1', 'email_verification');
      expect(mailer.send).toHaveBeenCalledOnce();
    });

    it.each([
      ['the address is unknown', null],
      ['the account is already verified', verified],
    ])('silently does nothing when %s', async (_label, user) => {
      const { service, users, codes, mailer } = setup();
      users.findByEmail.mockResolvedValue(user);

      await expect(service.resendVerification(dto)).resolves.toBeUndefined();

      expect(codes.issue).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('silently does nothing during the per-address cooldown', async () => {
      const { service, users, codes, mailer } = setup();
      users.findByEmail.mockResolvedValue(unverified);
      codes.isInCooldown.mockResolvedValue(true);

      await expect(service.resendVerification(dto)).resolves.toBeUndefined();

      expect(codes.issue).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const dto = { email: EMAIL, password: PASSWORD };

    it('returns the user and a new session for correct credentials', async () => {
      const { service, hasher, sessions } = setup();

      const result = await service.login(dto);

      expect(hasher.verify).toHaveBeenCalledWith(PASSWORD, HASH);
      expect(sessions.issue).toHaveBeenCalledWith('user-1');
      expect(result.tokens).toEqual(TOKENS);
      expect(result.user).toEqual(verified);
    });

    it('never returns the password hash with the user', async () => {
      const { service } = setup();

      const { user } = await service.login(dto);

      expect(user).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(user)).not.toContain(HASH);
    });

    it('rejects a wrong password', async () => {
      const { service, hasher, sessions } = setup();
      hasher.verify.mockResolvedValue(false);

      const attempt = service.login(dto);

      await expect(attempt).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(attempt).rejects.toThrow(AUTH_MESSAGES.invalidCredentials);
      expect(sessions.issue).not.toHaveBeenCalled();
    });

    it('rejects an unknown address with the same error, after doing the same hashing work', async () => {
      const { service, users, hasher, sessions } = setup();
      users.findCredentialsByEmail.mockResolvedValue(null);
      hasher.verify.mockResolvedValue(false);

      const attempt = service.login(dto);

      await expect(attempt).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(attempt).rejects.toThrow(AUTH_MESSAGES.invalidCredentials);
      // Verified against a dummy hash, so timing does not reveal the account is missing.
      expect(hasher.verify).toHaveBeenCalledWith(PASSWORD, undefined);
      expect(sessions.issue).not.toHaveBeenCalled();
    });

    it('rejects an unverified account with a distinct code, only when the password is right', async () => {
      const { service, users, sessions } = setup();
      users.findCredentialsByEmail.mockResolvedValue(unverifiedAccount);

      const error = await service.login(dto).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toEqual({
        message: AUTH_MESSAGES.emailNotVerified,
        code: 'email_not_verified',
      });
      expect(sessions.issue).not.toHaveBeenCalled();
    });

    it('does not reveal that an account is unverified to someone with the wrong password', async () => {
      const { service, users, hasher } = setup();
      users.findCredentialsByEmail.mockResolvedValue(unverifiedAccount);
      hasher.verify.mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('upgrades the stored hash when it was made with weaker parameters', async () => {
      const { service, users, hasher } = setup();
      hasher.needsRehash.mockReturnValue(true);
      hasher.hash.mockResolvedValue('$scrypt$stronger-hash');

      await service.login(dto);

      expect(hasher.hash).toHaveBeenCalledWith(PASSWORD);
      expect(users.updatePasswordHash).toHaveBeenCalledWith(
        'user-1',
        '$scrypt$stronger-hash',
      );
    });

    it('leaves an up-to-date hash alone', async () => {
      const { service, users, hasher } = setup();

      await service.login(dto);

      expect(hasher.hash).not.toHaveBeenCalled();
      expect(users.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('traces a sign-in step by step', async () => {
      const { service } = setup();

      await service.login(dto);

      expect(logs.steps()).toEqual([
        'login.started',
        'login.account_loaded',
        'login.password_checked',
      ]);
      expect(logs()).toContain('login_succeeded');
    });

    it('keeps the email, password, hash and tokens out of the logs', async () => {
      const { service, hasher } = setup();

      await service.login(dto);
      hasher.verify.mockResolvedValue(false);
      await expect(service.login(dto)).rejects.toThrow();

      expect(logs()).toContain('login_failed');
      for (const secret of [
        EMAIL,
        PASSWORD,
        HASH,
        TOKENS.accessToken,
        TOKENS.refreshToken,
      ]) {
        expect(logs()).not.toContain(secret);
      }
    });
  });

  describe('refresh', () => {
    it('returns the rotated tokens', async () => {
      const { service, sessions } = setup();

      expect(await service.refresh('old-refresh-token')).toEqual(TOKENS);
      expect(sessions.rotate).toHaveBeenCalledWith('old-refresh-token');
    });

    it('rejects when there is no live token', async () => {
      const { service, sessions } = setup();
      sessions.rotate.mockResolvedValue(null);

      const attempt = service.refresh('used-or-expired');

      await expect(attempt).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(attempt).rejects.toThrow(AUTH_MESSAGES.sessionExpired);
    });

    it('rejects and revokes the new session when the account no longer exists', async () => {
      const { service, users, sessions } = setup();
      users.findById.mockResolvedValue(null);

      await expect(service.refresh('old-refresh-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(sessions.revoke).toHaveBeenCalledWith(TOKENS.refreshToken);
    });

    it('keeps tokens out of the logs', async () => {
      const { service } = setup();

      await service.refresh('old-refresh-token');

      expect(logs()).toContain('session_refreshed');
      for (const secret of [
        'old-refresh-token',
        TOKENS.accessToken,
        TOKENS.refreshToken,
      ]) {
        expect(logs()).not.toContain(secret);
      }
    });
  });

  describe('logout', () => {
    it('revokes the session', async () => {
      const { service, sessions } = setup();

      await service.logout('refresh-token');

      expect(sessions.revoke).toHaveBeenCalledWith('refresh-token');
    });

    it('succeeds when there was no session to revoke', async () => {
      const { service, sessions } = setup();
      sessions.revoke.mockResolvedValue(false);

      await expect(service.logout(undefined)).resolves.toBeUndefined();
    });
  });
});

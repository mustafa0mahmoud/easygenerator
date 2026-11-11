import { InMemoryMailTransport, MailTransport } from '@nestjs/mail';
import { getModelToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Model } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import {
  AUTH_MESSAGES,
  AUTH_RATE_LIMITS,
  ONE_TIME_CODE,
} from '../src/modules/auth/auth.constants.js';
import { OneTimeCode } from '../src/modules/auth/one-time-codes/schemas/one-time-code.schema.js';
import { User } from '../src/modules/users/schemas/user.schema.js';

const PASSWORD = 'Passw0rd!';
const BASE = '/api/v1/auth';

/**
 * Sign-up and email verification through the real HTTP stack and a real
 * MongoDB. Only email delivery is replaced, by an in-memory mailbox.
 */
describe('Sign-up and email verification (e2e)', () => {
  let app: NestExpressApplication;
  let users: Model<User>;
  let codes: Model<OneTimeCode>;
  const mailbox = new InMemoryMailTransport();
  let clientCounter = 0;
  let clientIp: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailTransport)
      .useValue(mailbox)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();

    users = app.get(getModelToken(User.name));
    codes = app.get(getModelToken(OneTimeCode.name));
    // The unique indexes are part of the behaviour under test.
    await Promise.all([users.init(), codes.init()]);
  });

  beforeEach(async () => {
    await Promise.all([users.deleteMany({}), codes.deleteMany({})]);
    mailbox.clear();
    // A fresh client address per test keeps the per-IP limits out of the way.
    clientCounter += 1;
    clientIp = `10.1.${Math.floor(clientCounter / 250)}.${(clientCounter % 250) + 1}`;
  });

  afterAll(async () => {
    await Promise.all([users.deleteMany({}), codes.deleteMany({})]);
    await app.close();
  });

  const post = (path: string, body: object) =>
    request(app.getHttpServer())
      .post(`${BASE}${path}`)
      .set('X-Forwarded-For', clientIp)
      .send(body);

  const signUp = (overrides: object = {}) =>
    post('/signup', {
      email: 'sara@example.com',
      name: 'Sara',
      password: PASSWORD,
      ...overrides,
    });

  /** Waits for the background email and returns the code it carries. */
  async function receivedCode(
    email: string,
    expectedMailCount = 1,
  ): Promise<string> {
    const mails = await vi.waitFor(() => {
      const sent = mailbox.filter({ to: email });
      expect(sent).toHaveLength(expectedMailCount);
      return sent;
    });
    const match = /\b(\d{6})\b/.exec(mails.at(-1)?.text ?? '');
    if (!match) throw new Error('The email does not contain a 6-digit code');
    return match[1];
  }

  const storedUser = (email: string) =>
    users.findOne({ email }).select('+passwordHash').lean().exec();

  const wrongCodeFor = (code: string) =>
    code === '000000' ? '000001' : '000000';

  /** Moves the live code's issue time back, as if the cooldown had passed. */
  async function skipCooldown(): Promise<void> {
    await codes.updateMany(
      {},
      {
        $set: {
          issuedAt: new Date(
            Date.now() - ONE_TIME_CODE.RESEND_COOLDOWN_MS - 1000,
          ),
        },
      },
    );
  }

  describe('complete flow', () => {
    it('registers, emails a code, and verifies the address', async () => {
      const signup = await signUp().expect(201);
      expect(signup.body).toEqual({ message: AUTH_MESSAGES.signupCreated });

      const created = await storedUser('sara@example.com');
      expect(created).toMatchObject({ name: 'Sara', emailVerifiedAt: null });

      const code = await receivedCode('sara@example.com');
      const verification = await post('/verify-email', {
        email: 'sara@example.com',
        code,
      }).expect(200);
      expect(verification.body).toEqual({
        message: AUTH_MESSAGES.emailVerified,
      });

      const verified = await storedUser('sara@example.com');
      expect(verified?.emailVerifiedAt).toBeInstanceOf(Date);
      expect(await codes.countDocuments()).toBe(0);
    });

    it('stores a salted scrypt hash, never the password', async () => {
      await signUp().expect(201);

      const user = await storedUser('sara@example.com');
      expect(user?.passwordHash).toMatch(/^\$scrypt\$/);
      expect(JSON.stringify(user)).not.toContain(PASSWORD);
    });

    it('stores a hash of the code, never the code', async () => {
      await signUp().expect(201);
      const code = await receivedCode('sara@example.com');

      const stored = await codes.findOne().lean().exec();
      expect(stored?.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(stored)).not.toContain(code);
    });

    it('treats differently-cased addresses as the same account', async () => {
      await signUp({ email: '  Sara@Example.COM ' }).expect(201);

      expect(await users.countDocuments()).toBe(1);
      const code = await receivedCode('sara@example.com');
      await post('/verify-email', { email: 'SARA@example.com', code }).expect(
        200,
      );
    });

    it('sends the email to the registered address with the code and its lifetime', async () => {
      await signUp().expect(201);
      await receivedCode('sara@example.com');

      const [mail] = mailbox.mails;
      expect(mail.to).toEqual([{ name: 'Sara', address: 'sara@example.com' }]);
      expect(mail.subject).toBe('Your verification code');
      expect(mail.text).toContain('5 minutes');
    });

    it('escapes a name containing HTML in the email body', async () => {
      await signUp({ name: '<img src=x onerror=alert(1)>' }).expect(201);
      await receivedCode('sara@example.com');

      const [mail] = mailbox.mails;
      expect(mail.html).not.toContain('<img');
      expect(mail.html).toContain('&lt;img');
    });
  });

  describe('address already registered', () => {
    it('rejects a sign-up for a verified address and leaves the account untouched', async () => {
      await signUp().expect(201);
      const code = await receivedCode('sara@example.com');
      await post('/verify-email', { email: 'sara@example.com', code }).expect(
        200,
      );
      const before = await storedUser('sara@example.com');
      mailbox.clear();

      const response = await signUp({
        name: 'Attacker',
        password: 'Attacker1!',
      }).expect(409);

      expect(response.body).toMatchObject({
        statusCode: 409,
        error: 'Conflict',
        message: AUTH_MESSAGES.emailTaken,
      });
      const after = await storedUser('sara@example.com');
      expect(after?.name).toBe('Sara');
      expect(after?.passwordHash).toBe(before?.passwordHash);
      expect(mailbox.mails).toHaveLength(0);
      expect(await users.countDocuments()).toBe(1);
    });

    it('rejects a sign-up for an unverified address without replacing its credentials', async () => {
      await signUp().expect(201);
      const code = await receivedCode('sara@example.com');
      const before = await storedUser('sara@example.com');
      await skipCooldown();

      await signUp({ name: 'Someone Else', password: 'Another1!' }).expect(409);

      const after = await storedUser('sara@example.com');
      expect(after?.name).toBe('Sara');
      expect(after?.passwordHash).toBe(before?.passwordHash);
      expect(mailbox.mails).toHaveLength(1);
      // The original code still works: nothing about the first attempt changed.
      await post('/verify-email', { email: 'sara@example.com', code }).expect(
        200,
      );
    });

    it('matches the address whatever its letter case', async () => {
      await signUp().expect(201);

      await signUp({ email: 'SARA@Example.com' }).expect(409);

      expect(await users.countDocuments()).toBe(1);
    });

    it('creates one account when the same address signs up concurrently', async () => {
      const responses = await Promise.all([signUp(), signUp(), signUp()]);

      const statuses = responses.map((response) => response.status);
      expect(statuses.filter((status) => status === 201)).toHaveLength(1);
      expect(statuses.filter((status) => status === 409)).toHaveLength(2);
      expect(await users.countDocuments()).toBe(1);
      expect(await codes.countDocuments()).toBe(1);
    });
  });

  describe('responses that stay uniform', () => {
    it('answers resend identically for unknown, unverified and verified addresses', async () => {
      const unknown = await post('/resend-verification', {
        email: 'nobody@example.com',
      }).expect(202);

      await signUp().expect(201);
      await skipCooldown();
      const unverified = await post('/resend-verification', {
        email: 'sara@example.com',
      }).expect(202);

      const code = await receivedCode('sara@example.com', 2);
      await post('/verify-email', { email: 'sara@example.com', code }).expect(
        200,
      );
      const verified = await post('/resend-verification', {
        email: 'sara@example.com',
      }).expect(202);

      expect(unknown.body).toEqual({
        message: AUTH_MESSAGES.verificationResent,
      });
      expect(unverified.body).toEqual(unknown.body);
      expect(verified.body).toEqual(unknown.body);
      expect(mailbox.filter({ to: 'nobody@example.com' })).toHaveLength(0);
    });

    it('returns the same verification error for an unknown address and a wrong code', async () => {
      await signUp().expect(201);
      const code = await receivedCode('sara@example.com');

      const wrongCode = await post('/verify-email', {
        email: 'sara@example.com',
        code: wrongCodeFor(code),
      }).expect(400);
      const unknownAddress = await post('/verify-email', {
        email: 'nobody@example.com',
        code,
      }).expect(400);

      expect(wrongCode.body.message).toBe(AUTH_MESSAGES.invalidCode);
      expect(unknownAddress.body.message).toBe(AUTH_MESSAGES.invalidCode);
    });
  });

  describe('verification code', () => {
    it('is destroyed after 5 wrong attempts, so the correct code stops working', async () => {
      await signUp().expect(201);
      const code = await receivedCode('sara@example.com');

      for (
        let attempt = 0;
        attempt < ONE_TIME_CODE.MAX_ATTEMPTS;
        attempt += 1
      ) {
        await post('/verify-email', {
          email: 'sara@example.com',
          code: wrongCodeFor(code),
        }).expect(400);
      }

      await post('/verify-email', { email: 'sara@example.com', code }).expect(
        400,
      );
      expect(await codes.countDocuments()).toBe(0);
      expect(
        (await storedUser('sara@example.com'))?.emailVerifiedAt,
      ).toBeNull();
    });

    it('is rejected once expired', async () => {
      await signUp().expect(201);
      const code = await receivedCode('sara@example.com');
      await codes.updateMany(
        {},
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );

      await post('/verify-email', { email: 'sara@example.com', code }).expect(
        400,
      );
      expect(
        (await storedUser('sara@example.com'))?.emailVerifiedAt,
      ).toBeNull();
    });

    it('cannot be used twice', async () => {
      await signUp().expect(201);
      const code = await receivedCode('sara@example.com');

      await post('/verify-email', { email: 'sara@example.com', code }).expect(
        200,
      );
      await post('/verify-email', { email: 'sara@example.com', code }).expect(
        400,
      );
    });

    it('verifies only once when the correct code is submitted concurrently', async () => {
      await signUp().expect(201);
      const code = await receivedCode('sara@example.com');
      const body = { email: 'sara@example.com', code };

      const responses = await Promise.all([
        post('/verify-email', body),
        post('/verify-email', body),
      ]);

      expect(responses.map((response) => response.status)).toContain(200);
      expect(
        (await storedUser('sara@example.com'))?.emailVerifiedAt,
      ).toBeInstanceOf(Date);
      expect(await codes.countDocuments()).toBe(0);
    });
  });

  describe('resend', () => {
    it('replaces the code after the cooldown', async () => {
      await signUp().expect(201);
      const firstCode = await receivedCode('sara@example.com');

      await skipCooldown();
      await post('/resend-verification', { email: 'sara@example.com' }).expect(
        202,
      );
      const secondCode = await receivedCode('sara@example.com', 2);

      if (firstCode !== secondCode) {
        await post('/verify-email', {
          email: 'sara@example.com',
          code: firstCode,
        }).expect(400);
      }
      const latest = await receivedCode('sara@example.com', 2);
      await post('/verify-email', {
        email: 'sara@example.com',
        code: latest,
      }).expect(200);
    });

    it('sends nothing during the cooldown and keeps the current code valid', async () => {
      await signUp().expect(201);
      const code = await receivedCode('sara@example.com');

      await post('/resend-verification', { email: 'sara@example.com' }).expect(
        202,
      );

      expect(mailbox.mails).toHaveLength(1);
      await post('/verify-email', { email: 'sara@example.com', code }).expect(
        200,
      );
    });
  });

  describe('input validation', () => {
    it.each([
      [
        'an invalid email',
        { email: 'not-an-email' },
        'Email must be a valid email address',
      ],
      [
        'a name shorter than 3 characters',
        { name: 'Al' },
        'Name must be at least 3 characters',
      ],
      [
        'a password shorter than 8 characters',
        { password: 'Ab1!' },
        'Password must be at least 8 characters',
      ],
      [
        'a password without a letter',
        { password: '12345678!' },
        'Password must contain at least one letter',
      ],
      [
        'a password without a number',
        { password: 'Password!' },
        'Password must contain at least one number',
      ],
      [
        'a password without a special character',
        { password: 'Password1' },
        'Password must contain at least one special character',
      ],
    ])('rejects %s', async (_label, overrides, expectedMessage) => {
      const response = await signUp(overrides).expect(400);

      expect(response.body.statusCode).toBe(400);
      expect(response.body.message.join(' ')).toContain(expectedMessage);
      expect(await users.countDocuments()).toBe(0);
    });

    it('rejects properties that are not part of the contract', async () => {
      await signUp({
        emailVerifiedAt: '2020-01-01T00:00:00.000Z',
        role: 'admin',
      }).expect(400);

      expect(await users.countDocuments()).toBe(0);
    });

    it('rejects a missing body and non-string fields', async () => {
      await post('/signup', {}).expect(400);
      await post('/signup', {
        email: { $ne: null },
        name: ['x'],
        password: 12345678,
      }).expect(400);
      await post('/verify-email', {
        email: { $gt: '' },
        code: { $gt: '' },
      }).expect(400);

      expect(await users.countDocuments()).toBe(0);
    });

    it('rejects a verification code that is not six digits', async () => {
      const response = await post('/verify-email', {
        email: 'sara@example.com',
        code: '12ab',
      }).expect(400);

      expect(response.body.message.join(' ')).toContain(
        'Code must be exactly 6 digits',
      );
    });

    it('never echoes the submitted password back', async () => {
      const response = await signUp({ password: 'short-pw' }).expect(400);

      expect(JSON.stringify(response.body)).not.toContain('short-pw');
    });
  });

  describe('rate limiting', () => {
    it('limits sign-up attempts per client', async () => {
      for (
        let attempt = 0;
        attempt < AUTH_RATE_LIMITS.signup.limit;
        attempt += 1
      ) {
        await signUp({ email: `user${attempt}@example.com` }).expect(201);
      }

      const blocked = await signUp({
        email: 'one-too-many@example.com',
      }).expect(429);

      expect(blocked.body.statusCode).toBe(429);
      expect(
        await users.countDocuments({ email: 'one-too-many@example.com' }),
      ).toBe(0);
    });

    it('limits resend requests per client', async () => {
      for (
        let attempt = 0;
        attempt < AUTH_RATE_LIMITS.resendVerification.limit;
        attempt += 1
      ) {
        await post('/resend-verification', {
          email: 'nobody@example.com',
        }).expect(202);
      }

      await post('/resend-verification', {
        email: 'nobody@example.com',
      }).expect(429);
    });
  });
});

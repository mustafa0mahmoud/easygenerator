import {
  AUTH_MESSAGES,
  AUTH_RATE_LIMITS,
  ONE_TIME_CODE,
} from '../src/modules/auth/auth.constants.js';
import {
  type AuthApp,
  cookieHeader,
  createAuthApp,
  setCookies,
} from './support/auth-app.js';

const EMAIL = 'sara@example.com';
const OLD_PASSWORD = 'Passw0rd!';
const NEW_PASSWORD = 'N3w-Passw0rd!';

/** Password recovery through the real HTTP stack and a real MongoDB. */
describe('Password reset (e2e)', () => {
  let ctx: AuthApp;

  beforeAll(async () => {
    ctx = await createAuthApp('10.3');
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** Registers an account; verifies its email unless told otherwise. */
  async function register({
    verify = true,
    password = OLD_PASSWORD,
  } = {}): Promise<void> {
    await ctx
      .post('/signup', { email: EMAIL, name: 'Sara', password })
      .expect(201);
    const code = await ctx.receivedCode(EMAIL);
    if (verify) {
      await ctx.post('/verify-email', { email: EMAIL, code }).expect(200);
    }
    ctx.mailbox.clear();
  }

  const login = (password: string) =>
    ctx.post('/login', { email: EMAIL, password });

  const storedUser = () =>
    ctx.users.findOne({ email: EMAIL }).select('+passwordHash').lean().exec();

  const wrongCodeFor = (code: string) =>
    code === '000000' ? '000001' : '000000';

  /** Moves the live codes' issue time back, as if the cooldown had passed. */
  const skipCooldown = () =>
    ctx.codes.updateMany(
      {},
      {
        $set: {
          issuedAt: new Date(
            Date.now() - ONE_TIME_CODE.RESEND_COOLDOWN_MS - 1000,
          ),
        },
      },
    );

  async function requestReset(expectedMailCount = 1): Promise<string> {
    await ctx.post('/forgot-password', { email: EMAIL }).expect(202);
    return ctx.receivedCode(EMAIL, expectedMailCount);
  }

  describe('complete flow', () => {
    it('emails a code, changes the password, and the new password signs in', async () => {
      await register();

      const request = await ctx
        .post('/forgot-password', { email: EMAIL })
        .expect(202);
      expect(request.body).toEqual({
        message: AUTH_MESSAGES.passwordResetRequested,
      });
      const code = await ctx.receivedCode(EMAIL);

      const reset = await ctx
        .post('/reset-password', { email: EMAIL, code, password: NEW_PASSWORD })
        .expect(200);
      expect(reset.body).toEqual({ message: AUTH_MESSAGES.passwordReset });

      await login(OLD_PASSWORD).expect(401);
      await login(NEW_PASSWORD).expect(200);
    });

    it('stores the new password as a different hash, never in plain text', async () => {
      await register();
      const before = await storedUser();
      const code = await requestReset();

      await ctx
        .post('/reset-password', { email: EMAIL, code, password: NEW_PASSWORD })
        .expect(200);

      const after = await storedUser();
      expect(after?.passwordHash).toMatch(/^\$scrypt\$/);
      expect(after?.passwordHash).not.toBe(before?.passwordHash);
      expect(JSON.stringify(after)).not.toContain(NEW_PASSWORD);
    });

    it('does not sign the user in: no cookies are set by the reset itself', async () => {
      await register();
      const code = await requestReset();

      const response = await ctx
        .post('/reset-password', { email: EMAIL, code, password: NEW_PASSWORD })
        .expect(200);

      expect(setCookies(response)).toEqual({});
    });

    it('sends a reset email distinct from the verification email', async () => {
      await register();
      await requestReset();

      const [mail] = ctx.mailbox.mails;
      expect(mail.subject).toBe('Your password reset code');
      expect(mail.to).toEqual([{ name: 'Sara', address: EMAIL }]);
      expect(mail.text).toContain('5 minutes');
    });
  });

  describe('existing sessions', () => {
    it('ends every session of the account, on every device', async () => {
      await register();
      const laptop = setCookies(await login(OLD_PASSWORD).expect(200));
      const phone = setCookies(await login(OLD_PASSWORD).expect(200));
      expect(await ctx.refreshTokens.countDocuments()).toBe(2);
      const code = await requestReset();

      await ctx
        .post('/reset-password', { email: EMAIL, code, password: NEW_PASSWORD })
        .expect(200);

      expect(await ctx.refreshTokens.countDocuments()).toBe(0);
      for (const device of [laptop, phone]) {
        await ctx
          .post('/refresh')
          .set('Cookie', cookieHeader(device, 'refresh_token'))
          .expect(401);
      }
    });

    it('leaves sessions alone when the reset fails', async () => {
      await register();
      const session = setCookies(await login(OLD_PASSWORD).expect(200));
      const code = await requestReset();

      await ctx
        .post('/reset-password', {
          email: EMAIL,
          code: wrongCodeFor(code),
          password: NEW_PASSWORD,
        })
        .expect(400);

      await ctx
        .post('/refresh')
        .set('Cookie', cookieHeader(session, 'refresh_token'))
        .expect(204);
      await login(OLD_PASSWORD).expect(200);
    });
  });

  describe('address registered by someone else', () => {
    it('lets the real owner take the account back, verified, with the squatter locked out', async () => {
      // Someone registers the owner's address with a password of their own.
      // They never receive the code, so the account stays unverified.
      await register({ verify: false, password: 'Squatter-pass1!' });
      expect((await storedUser())?.emailVerifiedAt).toBeNull();

      // The owner cannot sign up (409) and recovers the account instead.
      await ctx
        .post('/signup', { email: EMAIL, name: 'Sara', password: NEW_PASSWORD })
        .expect(409);
      const code = await requestReset();
      await ctx
        .post('/reset-password', { email: EMAIL, code, password: NEW_PASSWORD })
        .expect(200);

      expect((await storedUser())?.emailVerifiedAt).toBeInstanceOf(Date);
      await login('Squatter-pass1!').expect(401);
      await login(NEW_PASSWORD).expect(200);
      // The verification code emailed at sign-up is dead too.
      expect(await ctx.codes.countDocuments()).toBe(0);
    });
  });

  describe('reset code', () => {
    it('is destroyed after 5 wrong attempts, so the correct code stops working', async () => {
      await register();
      const code = await requestReset();

      for (
        let attempt = 0;
        attempt < ONE_TIME_CODE.MAX_ATTEMPTS;
        attempt += 1
      ) {
        await ctx
          .post('/reset-password', {
            email: EMAIL,
            code: wrongCodeFor(code),
            password: NEW_PASSWORD,
          })
          .expect(400);
      }

      await ctx
        .post('/reset-password', { email: EMAIL, code, password: NEW_PASSWORD })
        .expect(400);
      await login(OLD_PASSWORD).expect(200);
    });

    it('is rejected once expired', async () => {
      await register();
      const code = await requestReset();
      await ctx.codes.updateMany(
        {},
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );

      await ctx
        .post('/reset-password', { email: EMAIL, code, password: NEW_PASSWORD })
        .expect(400);
      await login(OLD_PASSWORD).expect(200);
    });

    it('cannot be used twice', async () => {
      await register();
      const code = await requestReset();
      await ctx
        .post('/reset-password', { email: EMAIL, code, password: NEW_PASSWORD })
        .expect(200);

      await ctx
        .post('/reset-password', {
          email: EMAIL,
          code,
          password: 'An0ther-pass!',
        })
        .expect(400);
      await login(NEW_PASSWORD).expect(200);
    });

    it('is not interchangeable with an email verification code', async () => {
      // An unverified account has a live verification code.
      await ctx
        .post('/signup', { email: EMAIL, name: 'Sara', password: OLD_PASSWORD })
        .expect(201);
      const verificationCode = await ctx.receivedCode(EMAIL);

      // A verification code must not reset the password...
      await ctx
        .post('/reset-password', {
          email: EMAIL,
          code: verificationCode,
          password: NEW_PASSWORD,
        })
        .expect(400);

      // ...and a reset code must not verify the email.
      const resetCode = await requestReset(2);
      if (resetCode !== verificationCode) {
        await ctx
          .post('/verify-email', { email: EMAIL, code: resetCode })
          .expect(400);
      }
      expect((await storedUser())?.emailVerifiedAt).toBeNull();
    });

    it('is replaced by a newer one after the cooldown', async () => {
      await register();
      const first = await requestReset();
      await skipCooldown();
      const second = await requestReset(2);

      if (first !== second) {
        await ctx
          .post('/reset-password', {
            email: EMAIL,
            code: first,
            password: NEW_PASSWORD,
          })
          .expect(400);
      }
      const latest = await ctx.receivedCode(EMAIL, 2);
      await ctx
        .post('/reset-password', {
          email: EMAIL,
          code: latest,
          password: NEW_PASSWORD,
        })
        .expect(200);
    });
  });

  describe('responses that stay uniform', () => {
    it('answers a reset request identically for known and unknown addresses', async () => {
      await register();

      const known = await ctx
        .post('/forgot-password', { email: EMAIL })
        .expect(202);
      const unknown = await ctx
        .post('/forgot-password', { email: 'nobody@example.com' })
        .expect(202);

      expect(unknown.body).toEqual(known.body);
      expect(ctx.mailbox.filter({ to: 'nobody@example.com' })).toHaveLength(0);
    });

    it('returns the same error for an unknown address and a wrong code', async () => {
      await register();
      const code = await requestReset();

      const wrongCode = await ctx
        .post('/reset-password', {
          email: EMAIL,
          code: wrongCodeFor(code),
          password: NEW_PASSWORD,
        })
        .expect(400);
      const unknownAddress = await ctx
        .post('/reset-password', {
          email: 'nobody@example.com',
          code,
          password: NEW_PASSWORD,
        })
        .expect(400);

      expect(wrongCode.body.message).toBe(AUTH_MESSAGES.invalidResetCode);
      expect(unknownAddress.body.message).toBe(AUTH_MESSAGES.invalidResetCode);
    });

    it('sends at most one code per minute to an address', async () => {
      await register();

      await ctx.post('/forgot-password', { email: EMAIL }).expect(202);
      await ctx.receivedCode(EMAIL);
      await ctx.post('/forgot-password', { email: EMAIL }).expect(202);

      expect(ctx.mailbox.mails).toHaveLength(1);
    });
  });

  describe('input validation', () => {
    it('rejects a weak new password without spending a code attempt', async () => {
      await register();
      const code = await requestReset();

      const response = await ctx
        .post('/reset-password', { email: EMAIL, code, password: 'weak' })
        .expect(400);

      expect(response.body.message.join(' ')).toContain(
        'Password must be at least 8 characters',
      );
      const stored = await ctx.codes
        .findOne({ purpose: 'password_reset' })
        .lean()
        .exec();
      expect(stored?.attempts).toBe(0);
      // The code is still good for a valid password.
      await ctx
        .post('/reset-password', { email: EMAIL, code, password: NEW_PASSWORD })
        .expect(200);
    });

    it('rejects unknown properties and non-string fields', async () => {
      await ctx
        .post('/reset-password', {
          email: EMAIL,
          code: '123456',
          password: NEW_PASSWORD,
          emailVerifiedAt: '2020-01-01',
        })
        .expect(400);
      await ctx
        .post('/reset-password', {
          email: { $ne: null },
          code: { $ne: null },
          password: NEW_PASSWORD,
        })
        .expect(400);
      await ctx.post('/forgot-password', { email: { $ne: null } }).expect(400);
    });

    it('never echoes the submitted password back', async () => {
      const response = await ctx
        .post('/reset-password', {
          email: EMAIL,
          code: '123456',
          password: 'bad-pass',
        })
        .expect(400);

      expect(JSON.stringify(response.body)).not.toContain('bad-pass');
    });
  });

  describe('rate limiting', () => {
    it('limits reset requests per client', async () => {
      for (
        let attempt = 0;
        attempt < AUTH_RATE_LIMITS.forgotPassword.limit;
        attempt += 1
      ) {
        await ctx
          .post('/forgot-password', { email: 'nobody@example.com' })
          .expect(202);
      }

      await ctx
        .post('/forgot-password', { email: 'nobody@example.com' })
        .expect(429);
    });
  });
});

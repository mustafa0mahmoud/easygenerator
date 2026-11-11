import { JwtService } from '@nestjs/jwt';
import { InMemoryMailTransport, MailTransport } from '@nestjs/mail';
import { getModelToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Model } from 'mongoose';
import { createHash } from 'node:crypto';
import request, { type Response } from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import {
  AUTH_MESSAGES,
  AUTH_RATE_LIMITS,
} from '../src/modules/auth/auth.constants.js';
import { OneTimeCode } from '../src/modules/auth/one-time-codes/schemas/one-time-code.schema.js';
import { RefreshToken } from '../src/modules/auth/sessions/schemas/refresh-token.schema.js';
import { User } from '../src/modules/users/schemas/user.schema.js';

const EMAIL = 'sara@example.com';
const PASSWORD = 'Passw0rd!';
const AUTH = '/api/v1/auth';
const ME = '/api/v1/users/me';
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

interface ParsedCookie {
  value: string;
  attributes: string[];
}

/** Indexes the Set-Cookie headers of a response by cookie name. */
function setCookies(response: Response): Record<string, ParsedCookie> {
  const header = response.headers['set-cookie'] as unknown as
    string[] | undefined;
  const cookies: Record<string, ParsedCookie> = {};
  for (const line of header ?? []) {
    const [pair, ...attributes] = line.split(';').map((part) => part.trim());
    const separator = pair.indexOf('=');
    cookies[pair.slice(0, separator)] = {
      value: pair.slice(separator + 1),
      attributes,
    };
  }
  return cookies;
}

/** The Cookie request header a browser would send back. */
function cookieHeader(
  cookies: Record<string, ParsedCookie>,
  ...names: string[]
): string {
  return names.map((name) => `${name}=${cookies[name].value}`).join('; ');
}

/**
 * Sign-in, session renewal and sign-out through the real HTTP stack and a
 * real MongoDB. Only email delivery is replaced, by an in-memory mailbox.
 */
describe('Sign-in and session (e2e)', () => {
  let app: NestExpressApplication;
  let users: Model<User>;
  let codes: Model<OneTimeCode>;
  let refreshTokens: Model<RefreshToken>;
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
    refreshTokens = app.get(getModelToken(RefreshToken.name));
    await Promise.all([users.init(), codes.init(), refreshTokens.init()]);
  });

  const clearDatabase = () =>
    Promise.all([
      users.deleteMany({}),
      codes.deleteMany({}),
      refreshTokens.deleteMany({}),
    ]);

  beforeEach(async () => {
    await clearDatabase();
    mailbox.clear();
    // A fresh client address per test keeps the per-IP limits out of the way.
    clientCounter += 1;
    clientIp = `10.2.${Math.floor(clientCounter / 250)}.${(clientCounter % 250) + 1}`;
  });

  afterAll(async () => {
    await clearDatabase();
    await app.close();
  });

  const post = (path: string, body?: object) => {
    const pending = request(app.getHttpServer())
      .post(`${AUTH}${path}`)
      .set('X-Forwarded-For', clientIp);
    return body ? pending.send(body) : pending;
  };

  const getMe = () =>
    request(app.getHttpServer()).get(ME).set('X-Forwarded-For', clientIp);

  /** Registers an account; verifies its email unless told otherwise. */
  async function register(
    email = EMAIL,
    { verify = true } = {},
  ): Promise<void> {
    await post('/signup', { email, name: 'Sara', password: PASSWORD }).expect(
      201,
    );
    if (!verify) return;

    const mail = await vi.waitFor(() => mailbox.assertSent({ to: email }));
    const code = /\b(\d{6})\b/.exec(mail.text ?? '')?.[1];
    await post('/verify-email', { email, code }).expect(200);
  }

  async function signIn(email = EMAIL): Promise<Record<string, ParsedCookie>> {
    const response = await post('/login', { email, password: PASSWORD }).expect(
      200,
    );
    return setCookies(response);
  }

  describe('sign-in', () => {
    it('returns the user and sets the two session cookies', async () => {
      await register();

      const response = await post('/login', {
        email: EMAIL,
        password: PASSWORD,
      }).expect(200);

      expect(response.body).toEqual({
        user: {
          id: expect.any(String),
          email: EMAIL,
          name: 'Sara',
          createdAt: expect.stringMatching(ISO_TIMESTAMP),
        },
      });
      const cookies = setCookies(response);
      expect(Object.keys(cookies).sort()).toEqual([
        'access_token',
        'refresh_token',
      ]);
    });

    it('never puts a token or the password hash in the response body', async () => {
      await register();

      const response = await post('/login', {
        email: EMAIL,
        password: PASSWORD,
      }).expect(200);
      const cookies = setCookies(response);
      const body = JSON.stringify(response.body);

      expect(body).not.toContain(cookies.access_token.value);
      expect(body).not.toContain(cookies.refresh_token.value);
      expect(body).not.toContain('scrypt');
      expect(body).not.toContain('passwordHash');
    });

    it('protects both cookies: HttpOnly, Secure, SameSite=Strict, scoped paths, bounded lifetime', async () => {
      await register();

      const cookies = await signIn();

      expect(cookies.access_token.attributes).toEqual(
        expect.arrayContaining([
          'HttpOnly',
          'Secure',
          'SameSite=Strict',
          'Path=/api',
          'Max-Age=900',
        ]),
      );
      expect(cookies.refresh_token.attributes).toEqual(
        expect.arrayContaining([
          'HttpOnly',
          'Secure',
          'SameSite=Strict',
          'Path=/api/v1/auth',
          'Max-Age=604800',
        ]),
      );
    });

    it('stores only a hash of the refresh token', async () => {
      await register();

      const cookies = await signIn();

      const stored = await refreshTokens.find().lean().exec();
      expect(stored).toHaveLength(1);
      expect(stored[0].tokenHash).toBe(
        createHash('sha256').update(cookies.refresh_token.value).digest('hex'),
      );
      expect(JSON.stringify(stored)).not.toContain(cookies.refresh_token.value);
    });

    it('accepts the address in any letter case', async () => {
      await register();

      await post('/login', {
        email: '  SARA@Example.com ',
        password: PASSWORD,
      }).expect(200);
    });

    it('gives the same answer for a wrong password and an unknown address', async () => {
      await register();

      const wrongPassword = await post('/login', {
        email: EMAIL,
        password: 'Wrong-pass1!',
      }).expect(401);
      const unknownAddress = await post('/login', {
        email: 'nobody@example.com',
        password: PASSWORD,
      }).expect(401);

      expect(wrongPassword.body.message).toBe(AUTH_MESSAGES.invalidCredentials);
      expect(unknownAddress.body.message).toBe(wrongPassword.body.message);
      expect(unknownAddress.body.statusCode).toBe(
        wrongPassword.body.statusCode,
      );
      expect(setCookies(wrongPassword)).toEqual({});
      expect(await refreshTokens.countDocuments()).toBe(0);
    });

    it('refuses an unverified account with a distinct code, only when the password is right', async () => {
      await register(EMAIL, { verify: false });

      const rightPassword = await post('/login', {
        email: EMAIL,
        password: PASSWORD,
      }).expect(403);
      const wrongPassword = await post('/login', {
        email: EMAIL,
        password: 'Wrong-pass1!',
      }).expect(401);

      expect(rightPassword.body).toMatchObject({
        statusCode: 403,
        message: AUTH_MESSAGES.emailNotVerified,
        code: 'email_not_verified',
      });
      expect(setCookies(rightPassword)).toEqual({});
      expect(wrongPassword.body.message).toBe(AUTH_MESSAGES.invalidCredentials);
      expect(wrongPassword.body).not.toHaveProperty('code');
    });

    it('lets an unverified user sign in once the email is verified', async () => {
      await register(EMAIL, { verify: false });
      await post('/login', { email: EMAIL, password: PASSWORD }).expect(403);

      const mail = await vi.waitFor(() => mailbox.assertSent({ to: EMAIL }));
      const code = /\b(\d{6})\b/.exec(mail.text ?? '')?.[1];
      await post('/verify-email', { email: EMAIL, code }).expect(200);

      await post('/login', { email: EMAIL, password: PASSWORD }).expect(200);
    });

    it('rejects malformed input before looking anything up', async () => {
      await post('/login', {}).expect(400);
      await post('/login', {
        email: EMAIL,
        password: PASSWORD,
        admin: true,
      }).expect(400);
      await post('/login', {
        email: { $ne: null },
        password: { $ne: null },
      }).expect(400);
      await post('/login', { email: EMAIL, password: 'x'.repeat(129) }).expect(
        400,
      );
    });

    it('limits sign-in attempts per client', async () => {
      await register();

      for (
        let attempt = 0;
        attempt < AUTH_RATE_LIMITS.login.limit;
        attempt += 1
      ) {
        await post('/login', { email: EMAIL, password: 'Wrong-pass1!' }).expect(
          401,
        );
      }

      // Even the correct password is refused once the limit is reached.
      await post('/login', { email: EMAIL, password: PASSWORD }).expect(429);
    });
  });

  describe('protected endpoint', () => {
    it('returns the signed-in user', async () => {
      await register();
      const cookies = await signIn();

      const response = await getMe()
        .set('Cookie', cookieHeader(cookies, 'access_token'))
        .expect(200);

      expect(response.body).toEqual({
        id: expect.any(String),
        email: EMAIL,
        name: 'Sara',
        createdAt: expect.stringMatching(ISO_TIMESTAMP),
      });
      // The moment the account was made, not the moment it was asked for.
      const createdAt = Date.parse(
        (response.body as { createdAt: string }).createdAt,
      );
      expect(createdAt).toBeLessThanOrEqual(Date.now());
      expect(createdAt).toBeGreaterThan(Date.now() - 60_000);
    });

    it('answers 401 in the uniform error shape without a session', async () => {
      const response = await getMe().expect(401);

      expect(response.body).toEqual({
        statusCode: 401,
        error: 'Unauthorized',
        message: AUTH_MESSAGES.authenticationRequired,
        requestId: response.headers['x-request-id'],
        timestamp: expect.any(String),
        path: ME,
      });
    });

    it.each([
      ['a garbage token', 'not-a-jwt'],
      ['an unsigned token', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.'],
    ])('refuses %s', async (_label, token) => {
      await getMe().set('Cookie', `access_token=${token}`).expect(401);
    });

    it('refuses an expired access token', async () => {
      await register();
      const user = await users.findOne({ email: EMAIL }).lean().exec();
      const expired = await app
        .get(JwtService)
        .signAsync({ sub: String(user?._id) }, { expiresIn: -10 });

      await getMe().set('Cookie', `access_token=${expired}`).expect(401);
    });

    it('refuses a token signed with a different secret', async () => {
      await register();
      const user = await users.findOne({ email: EMAIL }).lean().exec();
      const forged = await new JwtService({
        secret: 'an-attackers-secret-of-sufficient-length-00',
      }).signAsync(
        { sub: String(user?._id) },
        { issuer: 'auth-api', audience: 'auth-web' },
      );

      await getMe().set('Cookie', `access_token=${forged}`).expect(401);
    });

    it('does not accept the token from the Authorization header', async () => {
      await register();
      const cookies = await signIn();

      await getMe()
        .set('Authorization', `Bearer ${cookies.access_token.value}`)
        .expect(401);
    });

    it('refuses a valid token whose account no longer exists', async () => {
      await register();
      const cookies = await signIn();
      await users.deleteMany({});

      await getMe()
        .set('Cookie', cookieHeader(cookies, 'access_token'))
        .expect(401);
    });

    it('does not accept the refresh token as an access token', async () => {
      await register();
      const cookies = await signIn();

      await getMe()
        .set('Cookie', `access_token=${cookies.refresh_token.value}`)
        .expect(401);
    });
  });

  describe('session renewal', () => {
    it('replaces both cookies and keeps the user signed in', async () => {
      await register();
      const original = await signIn();

      const response = await post('/refresh')
        .set('Cookie', cookieHeader(original, 'refresh_token'))
        .expect(204);
      const renewed = setCookies(response);

      expect(renewed.refresh_token.value).not.toBe(
        original.refresh_token.value,
      );
      expect(renewed.access_token.value).toEqual(expect.any(String));
      await getMe()
        .set('Cookie', cookieHeader(renewed, 'access_token'))
        .expect(200);
      expect(await refreshTokens.countDocuments()).toBe(1);
    });

    it('makes the old refresh token useless as soon as it is exchanged', async () => {
      await register();
      const original = await signIn();
      const renewed = setCookies(
        await post('/refresh')
          .set('Cookie', cookieHeader(original, 'refresh_token'))
          .expect(204),
      );

      await post('/refresh')
        .set('Cookie', cookieHeader(original, 'refresh_token'))
        .expect(401);

      // The legitimate holder of the new token is not affected.
      await post('/refresh')
        .set('Cookie', cookieHeader(renewed, 'refresh_token'))
        .expect(204);
    });

    it('lets exactly one of two concurrent renewals succeed', async () => {
      await register();
      const cookies = await signIn();
      const renew = () =>
        post('/refresh').set('Cookie', cookieHeader(cookies, 'refresh_token'));

      const responses = await Promise.all([renew(), renew()]);

      expect(
        responses.map((response) => response.status).sort((a, b) => a - b),
      ).toEqual([204, 401]);
      expect(await refreshTokens.countDocuments()).toBe(1);
    });

    it('answers 401 without a refresh cookie, and for a malformed one', async () => {
      const missing = await post('/refresh').expect(401);
      await post('/refresh')
        .set('Cookie', 'refresh_token=tampered')
        .expect(401);

      expect(missing.body.message).toBe(AUTH_MESSAGES.sessionExpired);
    });

    it('leaves the cookies alone when renewal fails, so a parallel tab is not signed out', async () => {
      const response = await post('/refresh')
        .set('Cookie', `refresh_token=${'A'.repeat(43)}`)
        .expect(401);

      expect(setCookies(response)).toEqual({});
    });

    it('refuses an expired refresh token', async () => {
      await register();
      const cookies = await signIn();
      await refreshTokens.updateMany(
        {},
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );

      await post('/refresh')
        .set('Cookie', cookieHeader(cookies, 'refresh_token'))
        .expect(401);
    });

    it('refuses renewal for an account that no longer exists', async () => {
      await register();
      const cookies = await signIn();
      await users.deleteMany({});

      await post('/refresh')
        .set('Cookie', cookieHeader(cookies, 'refresh_token'))
        .expect(401);
      expect(await refreshTokens.countDocuments()).toBe(0);
    });
  });

  describe('sign-out', () => {
    it('revokes the session server-side and clears both cookies', async () => {
      await register();
      const cookies = await signIn();

      const response = await post('/logout')
        .set('Cookie', cookieHeader(cookies, 'access_token', 'refresh_token'))
        .expect(204);

      const cleared = setCookies(response);
      expect(cleared.access_token.value).toBe('');
      expect(cleared.refresh_token.value).toBe('');
      expect(cleared.access_token.attributes).toEqual(
        expect.arrayContaining(['Path=/api']),
      );
      expect(cleared.refresh_token.attributes).toEqual(
        expect.arrayContaining(['Path=/api/v1/auth']),
      );
      expect(await refreshTokens.countDocuments()).toBe(0);
      // The stolen-cookie case: the old refresh token cannot start a new session.
      await post('/refresh')
        .set('Cookie', cookieHeader(cookies, 'refresh_token'))
        .expect(401);
    });

    it('works with only the refresh cookie, as when the access token has expired', async () => {
      await register();
      const cookies = await signIn();

      await post('/logout')
        .set('Cookie', cookieHeader(cookies, 'refresh_token'))
        .expect(204);

      expect(await refreshTokens.countDocuments()).toBe(0);
    });

    it('is safe to call twice and without any session', async () => {
      await register();
      const cookies = await signIn();
      const header = cookieHeader(cookies, 'refresh_token');

      await post('/logout').set('Cookie', header).expect(204);
      await post('/logout').set('Cookie', header).expect(204);
      await post('/logout').expect(204);
    });

    it('ends only the session it was called for', async () => {
      await register();
      const laptop = await signIn();
      const phone = await signIn();
      expect(await refreshTokens.countDocuments()).toBe(2);

      await post('/logout')
        .set('Cookie', cookieHeader(laptop, 'refresh_token'))
        .expect(204);

      await post('/refresh')
        .set('Cookie', cookieHeader(laptop, 'refresh_token'))
        .expect(401);
      await post('/refresh')
        .set('Cookie', cookieHeader(phone, 'refresh_token'))
        .expect(204);
    });
  });

  describe('cross-site request protection', () => {
    it('refuses a state-changing request the browser reports as cross-site', async () => {
      await register();

      const response = await post('/login', {
        email: EMAIL,
        password: PASSWORD,
      })
        .set('Sec-Fetch-Site', 'cross-site')
        .expect(403);

      expect(setCookies(response)).toEqual({});
      expect(await refreshTokens.countDocuments()).toBe(0);
    });

    it('refuses a request whose Origin does not match the host', async () => {
      await post('/logout').set('Origin', 'https://evil.example').expect(403);
    });

    it('accepts same-origin requests', async () => {
      await register();

      await post('/login', { email: EMAIL, password: PASSWORD })
        .set('Sec-Fetch-Site', 'same-origin')
        .expect(200);
    });

    it('does not interfere with safe methods', async () => {
      await getMe().set('Sec-Fetch-Site', 'cross-site').expect(401);
    });
  });

  describe('default-deny', () => {
    it('keeps the public routes reachable without a session', async () => {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      await post('/resend-verification', {
        email: 'nobody@example.com',
      }).expect(202);
    });
  });
});

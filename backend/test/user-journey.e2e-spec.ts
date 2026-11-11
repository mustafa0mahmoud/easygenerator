import {
  type AuthApp,
  cookieHeader,
  createAuthApp,
  setCookies,
} from './support/auth-app.js';

const EMAIL = 'journey@example.com';
const PASSWORD = 'Passw0rd!';
const NEW_PASSWORD = 'N3w-Passw0rd!';

/**
 * One user, start to finish, in the order a real person would go through it.
 * The other suites cover each step's edge cases; this one proves the steps
 * work together, with the state each one leaves behind.
 */
describe('User journey (e2e)', () => {
  let ctx: AuthApp;

  beforeAll(async () => {
    ctx = await createAuthApp('10.4');
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('signs up, verifies, signs in, uses the app, renews, recovers the password, and signs out', async () => {
    // 1. A visitor has no access to the protected page.
    await ctx.getMe().expect(401);

    // 2. They sign up. The account exists but cannot be used yet.
    await ctx
      .post('/signup', {
        email: EMAIL,
        name: 'Journey User',
        password: PASSWORD,
      })
      .expect(201);
    const blocked = await ctx
      .post('/login', { email: EMAIL, password: PASSWORD })
      .expect(403);
    expect(blocked.body.code).toBe('email_not_verified');

    // 3. They verify the address with the emailed code.
    const verificationCode = await ctx.receivedCode(EMAIL);
    await ctx
      .post('/verify-email', { email: EMAIL, code: verificationCode })
      .expect(200);

    // 4. They sign in and reach the protected page.
    const firstSession = setCookies(
      await ctx
        .post('/login', { email: EMAIL, password: PASSWORD })
        .expect(200),
    );
    const me = await ctx
      .getMe()
      .set('Cookie', cookieHeader(firstSession, 'access_token'))
      .expect(200);
    expect(me.body).toEqual({
      id: expect.any(String),
      email: EMAIL,
      name: 'Journey User',
    });

    // 5. The session is renewed; the old refresh token is dead afterwards.
    const renewed = setCookies(
      await ctx
        .post('/refresh')
        .set('Cookie', cookieHeader(firstSession, 'refresh_token'))
        .expect(204),
    );
    await ctx
      .post('/refresh')
      .set('Cookie', cookieHeader(firstSession, 'refresh_token'))
      .expect(401);
    await ctx
      .getMe()
      .set('Cookie', cookieHeader(renewed, 'access_token'))
      .expect(200);

    // 6. They forget the password and reset it. That ends the renewed session.
    await ctx.post('/forgot-password', { email: EMAIL }).expect(202);
    const resetCode = await ctx.receivedCode(EMAIL, 2);
    await ctx
      .post('/reset-password', {
        email: EMAIL,
        code: resetCode,
        password: NEW_PASSWORD,
      })
      .expect(200);
    await ctx
      .post('/refresh')
      .set('Cookie', cookieHeader(renewed, 'refresh_token'))
      .expect(401);

    // 7. Only the new password works.
    await ctx.post('/login', { email: EMAIL, password: PASSWORD }).expect(401);
    const finalSession = setCookies(
      await ctx
        .post('/login', { email: EMAIL, password: NEW_PASSWORD })
        .expect(200),
    );
    await ctx
      .getMe()
      .set('Cookie', cookieHeader(finalSession, 'access_token'))
      .expect(200);

    // 8. They sign out. The session cannot be renewed any more.
    await ctx
      .post('/logout')
      .set(
        'Cookie',
        cookieHeader(finalSession, 'access_token', 'refresh_token'),
      )
      .expect(204);
    await ctx
      .post('/refresh')
      .set('Cookie', cookieHeader(finalSession, 'refresh_token'))
      .expect(401);

    // Final state: one verified user, no live sessions, no leftover codes.
    const user = await ctx.users.findOne({ email: EMAIL }).lean().exec();
    expect(user?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await ctx.users.countDocuments()).toBe(1);
    expect(await ctx.refreshTokens.countDocuments()).toBe(0);
    expect(await ctx.codes.countDocuments()).toBe(0);
  });
});

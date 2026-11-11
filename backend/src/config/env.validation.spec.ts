import {
  EXAMPLE_JWT_ACCESS_SECRET,
  EXAMPLE_OTP_SECRET,
  validateEnv,
} from './env.validation.js';

const VALID_URI = 'mongodb://127.0.0.1:27017/app';
const STRONG_SECRET = 'a-real-secret-with-more-than-32-characters';

/** Smallest configuration that boots in development. */
const base = {
  MONGODB_URI: VALID_URI,
  OTP_SECRET: STRONG_SECRET,
  JWT_ACCESS_SECRET: STRONG_SECRET,
};

describe('validateEnv', () => {
  it('applies defaults when only the required variables are set', () => {
    expect(validateEnv(base)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      MONGODB_URI: VALID_URI,
      LOG_LEVEL: 'info',
      LOG_PRETTY: false,
      TRUST_PROXY_HOPS: 0,
      THROTTLE_TTL_SECONDS: 60,
      THROTTLE_LIMIT: 100,
      SWAGGER_ENABLED: true,
      MAIL_DRIVER: 'console',
      MAIL_FROM_NAME: 'Auth Task',
      MAIL_FROM_ADDRESS: 'no-reply@example.com',
      OTP_SECRET: STRONG_SECRET,
      JWT_ACCESS_SECRET: STRONG_SECRET,
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 7,
      COOKIE_SECURE: true,
      CSRF_TRUSTED_ORIGINS: [],
      PASSWORD_HASH_LOG_N: 17,
    });
  });

  it('converts numeric strings coming from the process environment', () => {
    const env = validateEnv({
      ...base,
      PORT: '8080',
      TRUST_PROXY_HOPS: '1',
      THROTTLE_LIMIT: '20',
    });

    expect(env.PORT).toBe(8080);
    expect(env.TRUST_PROXY_HOPS).toBe(1);
    expect(env.THROTTLE_LIMIT).toBe(20);
  });

  it('parses the string "false" as false, not as a truthy string', () => {
    const env = validateEnv({
      ...base,
      SWAGGER_ENABLED: 'false',
      LOG_PRETTY: 'true',
    });

    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.LOG_PRETTY).toBe(true);
  });

  it('accepts a mongodb+srv connection string', () => {
    const uri = 'mongodb+srv://cluster.example.net/app';

    expect(validateEnv({ ...base, MONGODB_URI: uri }).MONGODB_URI).toBe(uri);
  });

  it('ignores unrelated variables from the process environment', () => {
    expect(validateEnv({ ...base, PATH: '/usr/bin' })).not.toHaveProperty(
      'PATH',
    );
  });

  it.each([
    [
      'a missing database connection string',
      { ...base, MONGODB_URI: undefined },
      /MONGODB_URI/,
    ],
    [
      'a non-mongodb connection string',
      { ...base, MONGODB_URI: 'postgres://localhost/app' },
      /MONGODB_URI/,
    ],
    [
      'an unknown environment name',
      { ...base, NODE_ENV: 'staging' },
      /NODE_ENV/,
    ],
    ['a non-numeric port', { ...base, PORT: 'abc' }, /PORT/],
    ['a port outside the valid range', { ...base, PORT: '70000' }, /PORT/],
    ['an unknown log level', { ...base, LOG_LEVEL: 'loud' }, /LOG_LEVEL/],
    [
      'a non-boolean flag',
      { ...base, SWAGGER_ENABLED: 'yes' },
      /SWAGGER_ENABLED/,
    ],
    ['a zero rate limit', { ...base, THROTTLE_LIMIT: '0' }, /THROTTLE_LIMIT/],
    [
      'a negative proxy hop count',
      { ...base, TRUST_PROXY_HOPS: '-1' },
      /TRUST_PROXY_HOPS/,
    ],
    [
      'a missing one-time-code secret',
      { ...base, OTP_SECRET: undefined },
      /OTP_SECRET/,
    ],
    [
      'a missing token signing secret',
      { ...base, JWT_ACCESS_SECRET: undefined },
      /JWT_ACCESS_SECRET/,
    ],
    [
      'a short token signing secret',
      { ...base, JWT_ACCESS_SECRET: 'too-short' },
      /JWT_ACCESS_SECRET/,
    ],
    [
      'an access token lifetime under a minute',
      { ...base, ACCESS_TOKEN_TTL_SECONDS: '5' },
      /ACCESS_TOKEN_TTL_SECONDS/,
    ],
    [
      'an access token lifetime over an hour',
      { ...base, ACCESS_TOKEN_TTL_SECONDS: '86400' },
      /ACCESS_TOKEN_TTL_SECONDS/,
    ],
    [
      'a zero refresh token lifetime',
      { ...base, REFRESH_TOKEN_TTL_DAYS: '0' },
      /REFRESH_TOKEN_TTL_DAYS/,
    ],
    [
      'a non-boolean cookie flag',
      { ...base, COOKIE_SECURE: '1' },
      /COOKIE_SECURE/,
    ],
    [
      'a trusted origin with a path',
      { ...base, CSRF_TRUSTED_ORIGINS: 'https://app.example.com/login' },
      /CSRF_TRUSTED_ORIGINS/,
    ],
    [
      'a trusted origin without a scheme',
      { ...base, CSRF_TRUSTED_ORIGINS: 'app.example.com' },
      /CSRF_TRUSTED_ORIGINS/,
    ],
    [
      'a short one-time-code secret',
      { ...base, OTP_SECRET: 'too-short' },
      /OTP_SECRET/,
    ],
    ['an unknown mail driver', { ...base, MAIL_DRIVER: 'smtp' }, /MAIL_DRIVER/],
    [
      'an invalid sender address',
      { ...base, MAIL_FROM_ADDRESS: 'not-an-email' },
      /MAIL_FROM_ADDRESS/,
    ],
    [
      'a password hash cost below the supported range',
      { ...base, PASSWORD_HASH_LOG_N: '4' },
      /PASSWORD_HASH_LOG_N/,
    ],
  ])('rejects %s', (_label, config, expectedError) => {
    expect(() => validateEnv(config)).toThrow(expectedError);
  });

  it('reports every invalid variable at once', () => {
    const attempt = () => validateEnv({ PORT: 'abc' });

    expect(attempt).toThrow(/MONGODB_URI/);
    expect(attempt).toThrow(/PORT/);
    expect(attempt).toThrow(/OTP_SECRET/);
    expect(attempt).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('parses a comma-separated list of trusted origins', () => {
    const env = validateEnv({
      ...base,
      CSRF_TRUSTED_ORIGINS: 'https://app.example.com, http://localhost:5173',
    });

    expect(env.CSRF_TRUSTED_ORIGINS).toEqual([
      'https://app.example.com',
      'http://localhost:5173',
    ]);
  });

  it('never includes the offending value in the error message', () => {
    const secretLikeValue = 'postgres://user:super-secret@host/db';

    try {
      validateEnv({ ...base, MONGODB_URI: secretLikeValue });
      expect.unreachable('validation should have failed');
    } catch (error) {
      expect((error as Error).message).not.toContain('super-secret');
    }
  });

  describe('mail driver', () => {
    it('requires an API key for the Brevo driver', () => {
      expect(() => validateEnv({ ...base, MAIL_DRIVER: 'brevo' })).toThrow(
        /BREVO_API_KEY/,
      );
    });

    it('treats a blank API key as not set, so the console driver still starts', () => {
      const env = validateEnv({ ...base, BREVO_API_KEY: '' });

      expect(env.MAIL_DRIVER).toBe('console');
      expect(env.BREVO_API_KEY).toBeUndefined();
    });

    it('still requires a real API key for the Brevo driver when the key is blank', () => {
      expect(() =>
        validateEnv({ ...base, MAIL_DRIVER: 'brevo', BREVO_API_KEY: '' }),
      ).toThrow(/BREVO_API_KEY/);
    });

    it('accepts the Brevo driver with an API key', () => {
      const env = validateEnv({
        ...base,
        MAIL_DRIVER: 'brevo',
        BREVO_API_KEY: 'key',
      });

      expect(env.MAIL_DRIVER).toBe('brevo');
    });
  });

  describe('production safeguards', () => {
    const production = {
      ...base,
      NODE_ENV: 'production',
      MAIL_DRIVER: 'brevo',
      BREVO_API_KEY: 'key',
    };

    it('accepts a complete production configuration', () => {
      expect(validateEnv(production).NODE_ENV).toBe('production');
    });

    it('refuses the console mail driver, which logs verification codes', () => {
      expect(() =>
        validateEnv({ ...production, MAIL_DRIVER: 'console' }),
      ).toThrow(/MAIL_DRIVER/);
    });

    it('refuses the example one-time-code secret', () => {
      expect(() =>
        validateEnv({ ...production, OTP_SECRET: EXAMPLE_OTP_SECRET }),
      ).toThrow(/OTP_SECRET/);
    });

    it('refuses the example token signing secret', () => {
      expect(() =>
        validateEnv({
          ...production,
          JWT_ACCESS_SECRET: EXAMPLE_JWT_ACCESS_SECRET,
        }),
      ).toThrow(/JWT_ACCESS_SECRET/);
    });

    it('refuses session cookies without the Secure attribute', () => {
      expect(() =>
        validateEnv({ ...production, COOKIE_SECURE: 'false' }),
      ).toThrow(/COOKIE_SECURE/);
    });

    it('allows non-secure cookies for local HTTP development', () => {
      expect(
        validateEnv({ ...base, COOKIE_SECURE: 'false' }).COOKIE_SECURE,
      ).toBe(false);
    });

    it('allows the example secret outside production', () => {
      expect(
        validateEnv({ ...base, OTP_SECRET: EXAMPLE_OTP_SECRET }).OTP_SECRET,
      ).toBe(EXAMPLE_OTP_SECRET);
    });
  });
});

import { z } from 'zod';

export const NODE_ENVIRONMENTS = ['development', 'production', 'test'] as const;
export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;
export const MAIL_DRIVERS = ['console', 'brevo'] as const;

/** Values shipped in `.env.example`. Fine for development, refused in production. */
export const EXAMPLE_OTP_SECRET = 'dev-only-otp-secret-change-me-0000000000';
export const EXAMPLE_JWT_ACCESS_SECRET =
  'dev-only-jwt-secret-change-me-0000000000';

const MAX_PORT = 65535;
const MAX_TRUSTED_PROXY_HOPS = 10;
const MIN_SECRET_LENGTH = 32;

const MIN_ACCESS_TOKEN_TTL_SECONDS = 60;
const MAX_ACCESS_TOKEN_TTL_SECONDS = 3600;
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 900;
const MAX_REFRESH_TOKEN_TTL_DAYS = 90;
const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 7;

const MIN_PASSWORD_HASH_LOG_N = 10;
const MAX_PASSWORD_HASH_LOG_N = 20;
const DEFAULT_PASSWORD_HASH_LOG_N = 17;

const originList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .refine(
    (origins) =>
      origins.every(
        (origin) => URL.canParse(origin) && new URL(origin).origin === origin,
      ),
    'must be a comma-separated list of origins such as https://app.example.com',
  );

/**
 * Environment variables arrive as strings, and `Boolean('false')` is `true`,
 * so flags accept exactly the two literals and nothing else.
 */
const booleanFlag = (defaultValue: boolean) =>
  z
    .enum(['true', 'false'])
    .default(defaultValue ? 'true' : 'false')
    .transform((value) => value === 'true');

/**
 * An optional secret left blank (`KEY=`) counts as not set. Docker Compose
 * passes blank entries of the env file as empty strings.
 */
const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const integer = (min: number, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce.number().int().min(min).max(max);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENVIRONMENTS).default('development'),
    PORT: integer(1, MAX_PORT).default(3000),

    MONGODB_URI: z
      .string()
      .regex(
        /^mongodb(\+srv)?:\/\/.+/,
        'must be a mongodb:// or mongodb+srv:// connection string',
      ),

    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    LOG_PRETTY: booleanFlag(false),

    /**
     * Number of reverse proxies in front of the app. Needed so the client IP
     * used for rate limiting and logs is the real one, not the proxy's.
     */
    TRUST_PROXY_HOPS: integer(0, MAX_TRUSTED_PROXY_HOPS).default(0),

    THROTTLE_TTL_SECONDS: integer(1).default(60),
    THROTTLE_LIMIT: integer(1).default(100),

    SWAGGER_ENABLED: booleanFlag(true),

    MAIL_DRIVER: z.enum(MAIL_DRIVERS).default('console'),
    MAIL_FROM_NAME: z.string().trim().min(1).max(100).default('Auth Task'),
    MAIL_FROM_ADDRESS: z.email().default('no-reply@example.com'),
    BREVO_API_KEY: optionalSecret,

    /** Keys the HMAC of one-time codes, so a database leak alone cannot reveal them. */
    OTP_SECRET: z
      .string()
      .min(
        MIN_SECRET_LENGTH,
        `must be at least ${MIN_SECRET_LENGTH} characters`,
      ),

    JWT_ACCESS_SECRET: z
      .string()
      .min(
        MIN_SECRET_LENGTH,
        `must be at least ${MIN_SECRET_LENGTH} characters`,
      ),
    /** Short on purpose: an access token cannot be revoked before it expires. */
    ACCESS_TOKEN_TTL_SECONDS: integer(
      MIN_ACCESS_TOKEN_TTL_SECONDS,
      MAX_ACCESS_TOKEN_TTL_SECONDS,
    ).default(DEFAULT_ACCESS_TOKEN_TTL_SECONDS),
    REFRESH_TOKEN_TTL_DAYS: integer(1, MAX_REFRESH_TOKEN_TTL_DAYS).default(
      DEFAULT_REFRESH_TOKEN_TTL_DAYS,
    ),
    COOKIE_SECURE: booleanFlag(true),
    /**
     * Origins allowed to send state-changing requests besides the API's own.
     * Needed only when the browser reaches the API through a proxy on another host.
     */
    CSRF_TRUSTED_ORIGINS: originList,

    /** scrypt cost (log2 N). 17 is the OWASP minimum, about 128 MiB per hash. */
    PASSWORD_HASH_LOG_N: integer(
      MIN_PASSWORD_HASH_LOG_N,
      MAX_PASSWORD_HASH_LOG_N,
    ).default(DEFAULT_PASSWORD_HASH_LOG_N),
  })
  .superRefine((env, context) => {
    if (env.MAIL_DRIVER === 'brevo' && !env.BREVO_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['BREVO_API_KEY'],
        message: 'is required when MAIL_DRIVER is "brevo"',
      });
    }

    if (env.NODE_ENV !== 'production') return;

    if (env.MAIL_DRIVER === 'console') {
      context.addIssue({
        code: 'custom',
        path: ['MAIL_DRIVER'],
        message:
          'must not be "console" in production: it writes verification codes to the logs',
      });
    }
    if (env.OTP_SECRET === EXAMPLE_OTP_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['OTP_SECRET'],
        message: 'must not be the example value in production',
      });
    }
    if (env.JWT_ACCESS_SECRET === EXAMPLE_JWT_ACCESS_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'must not be the example value in production',
      });
    }
    if (!env.COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'must be true in production: session cookies require HTTPS',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validates the environment at startup. A missing or malformed variable stops
 * the application from booting instead of failing later at request time.
 * The error lists variable names and rules only, never the values.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}

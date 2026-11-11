import { minutes } from '@nestjs/throttler';

const MS_PER_MINUTE = 60_000;

export const ONE_TIME_CODE = {
  LENGTH: 6,
  /** Short on purpose: a 6-digit code is only safe for a few minutes. */
  TTL_MS: 5 * MS_PER_MINUTE,
  MAX_ATTEMPTS: 5,
  /** Minimum gap between two codes for the same account, whatever the caller's IP. */
  RESEND_COOLDOWN_MS: MS_PER_MINUTE,
} as const;

export const AUTH_RATE_LIMITS = {
  signup: { limit: 5, ttl: minutes(1) },
  verifyEmail: { limit: 10, ttl: minutes(1) },
  resendVerification: { limit: 3, ttl: minutes(1) },
  login: { limit: 5, ttl: minutes(1) },
  refresh: { limit: 30, ttl: minutes(1) },
  forgotPassword: { limit: 3, ttl: minutes(1) },
  resetPassword: { limit: 10, ttl: minutes(1) },
} as const;

/** Fixed claims checked on every access token, so a token minted elsewhere is refused. */
export const ACCESS_TOKEN = {
  ALGORITHM: 'HS256',
  ISSUER: 'auth-api',
  AUDIENCE: 'auth-web',
} as const;

export const AUTH_ERROR_CODES = {
  emailNotVerified: 'email_not_verified',
} as const;

export const AUTH_MESSAGES = {
  signupCreated:
    'Account created. A verification code has been sent to your email address.',
  emailTaken: 'This email address is already registered.',
  /** Fixed string: resend never reveals whether an address is awaiting verification. */
  verificationResent:
    'If this email address is awaiting verification, a new code has been sent to it.',
  emailVerified: 'Email verified. You can now sign in.',
  invalidCode: 'Invalid or expired verification code.',
  /** One message whether the address is unknown or the password is wrong. */
  invalidCredentials: 'Invalid email or password.',
  emailNotVerified: 'Email address is not verified.',
  authenticationRequired: 'Authentication required.',
  sessionExpired: 'Session expired. Please sign in again.',
  /** Fixed string: the answer never reveals whether the address has an account. */
  passwordResetRequested:
    'If this email address has an account, a password reset code has been sent to it.',
  passwordReset:
    'Password changed. You can now sign in with your new password.',
  invalidResetCode: 'Invalid or expired reset code.',
} as const;

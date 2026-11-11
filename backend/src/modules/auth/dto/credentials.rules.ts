import { z } from 'zod';
import { ONE_TIME_CODE } from '../auth.constants.js';

export const FIELD_LIMITS = {
  /** Longest address SMTP can route (RFC 5321). */
  EMAIL_MAX: 254,
  NAME_MIN: 3,
  NAME_MAX: 100,
  PASSWORD_MIN: 8,
  /** Upper bound so a request cannot make the server hash megabytes. */
  PASSWORD_MAX: 128,
} as const;

/** Trimmed and lowercased before validation, so `A@B.com ` and `a@b.com` are one account. */
export const emailRule = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .max(
    FIELD_LIMITS.EMAIL_MAX,
    `Email must be at most ${FIELD_LIMITS.EMAIL_MAX} characters`,
  )
  .pipe(z.email('Email must be a valid email address'));

export const nameRule = z
  .string({ error: 'Name is required' })
  .trim()
  .min(
    FIELD_LIMITS.NAME_MIN,
    `Name must be at least ${FIELD_LIMITS.NAME_MIN} characters`,
  )
  .max(
    FIELD_LIMITS.NAME_MAX,
    `Name must be at most ${FIELD_LIMITS.NAME_MAX} characters`,
  );

/**
 * Not trimmed: spaces are legitimate password characters.
 * A "special character" is anything that is not a letter, a digit or whitespace.
 */
export const passwordRule = z
  .string({ error: 'Password is required' })
  .min(
    FIELD_LIMITS.PASSWORD_MIN,
    `Password must be at least ${FIELD_LIMITS.PASSWORD_MIN} characters`,
  )
  .max(
    FIELD_LIMITS.PASSWORD_MAX,
    `Password must be at most ${FIELD_LIMITS.PASSWORD_MAX} characters`,
  )
  .regex(/\p{L}/u, 'Password must contain at least one letter')
  .regex(/\p{N}/u, 'Password must contain at least one number')
  .regex(
    /[^\p{L}\p{N}\s]/u,
    'Password must contain at least one special character',
  );

export const oneTimeCodeRule = z
  .string({ error: 'Code is required' })
  .regex(
    new RegExp(`^\\d{${ONE_TIME_CODE.LENGTH}}$`),
    `Code must be exactly ${ONE_TIME_CODE.LENGTH} digits`,
  );

import { z } from 'zod';
import { emailRule, FIELD_LIMITS } from './credentials.rules.js';

/**
 * Sign-in does not re-apply the password composition rules: it only needs a
 * bounded string to compare. Telling a caller "must contain a number" here
 * would describe the stored password to someone who does not know it.
 */
export const loginSchema = z.strictObject({
  email: emailRule,
  password: z
    .string({ error: 'Password is required' })
    .min(1, 'Password is required')
    .max(FIELD_LIMITS.PASSWORD_MAX, 'Invalid email or password.'),
});

export type LoginDto = z.infer<typeof loginSchema>;

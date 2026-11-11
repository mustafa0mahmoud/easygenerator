import { z } from 'zod';
import {
  emailRule,
  oneTimeCodeRule,
  passwordRule,
} from './credentials.rules.js';

/**
 * The new password goes through the same rules as at sign-up. Validation runs
 * before the code is checked, so a weak password does not cost an attempt.
 */
export const resetPasswordSchema = z.strictObject({
  email: emailRule,
  code: oneTimeCodeRule,
  password: passwordRule,
});

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

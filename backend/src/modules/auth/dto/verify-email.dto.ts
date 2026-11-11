import { z } from 'zod';
import { emailRule, oneTimeCodeRule } from './credentials.rules.js';

export const verifyEmailSchema = z.strictObject({
  email: emailRule,
  code: oneTimeCodeRule,
});

export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;

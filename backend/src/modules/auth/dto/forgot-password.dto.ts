import { z } from 'zod';
import { emailRule } from './credentials.rules.js';

export const forgotPasswordSchema = z.strictObject({
  email: emailRule,
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

import { z } from 'zod';
import { emailRule } from './credentials.rules.js';

export const resendVerificationSchema = z.strictObject({
  email: emailRule,
});

export type ResendVerificationDto = z.infer<typeof resendVerificationSchema>;

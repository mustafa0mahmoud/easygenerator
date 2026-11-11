import { z } from 'zod';
import { emailRule, nameRule, passwordRule } from './credentials.rules.js';

/** Strict: a request carrying any other property is rejected. */
export const signupSchema = z.strictObject({
  email: emailRule,
  name: nameRule,
  password: passwordRule,
});

export type SignupDto = z.infer<typeof signupSchema>;

import { z } from 'zod';

/**
 * The same limits the API enforces. Checking them here gives instant
 * feedback; the API remains the authority and checks them again.
 */
export const FIELD_LIMITS = {
  EMAIL_MAX: 254,
  NAME_MIN: 3,
  NAME_MAX: 100,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  CODE_LENGTH: 6,
} as const;

/** One list drives both the validation and the checklist under the field. */
export const PASSWORD_RULES = [
  {
    id: 'length',
    label: `${FIELD_LIMITS.PASSWORD_MIN} characters or more`,
    test: (value: string) => value.length >= FIELD_LIMITS.PASSWORD_MIN,
  },
  {
    id: 'letter',
    label: 'One letter',
    test: (value: string) => /\p{L}/u.test(value),
  },
  {
    id: 'number',
    label: 'One number',
    test: (value: string) => /\p{N}/u.test(value),
  },
  {
    id: 'special',
    label: 'One special character',
    test: (value: string) => /[^\p{L}\p{N}\s]/u.test(value),
  },
] as const;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email address')
  .max(FIELD_LIMITS.EMAIL_MAX, 'This email address is too long')
  .pipe(z.email('Enter a valid email address'));

const name = z
  .string()
  .trim()
  .min(
    FIELD_LIMITS.NAME_MIN,
    `Enter at least ${FIELD_LIMITS.NAME_MIN} characters`,
  )
  .max(
    FIELD_LIMITS.NAME_MAX,
    `Use at most ${FIELD_LIMITS.NAME_MAX} characters`,
  );

/** Not trimmed: spaces are legitimate password characters. */
const newPassword = z
  .string()
  .max(
    FIELD_LIMITS.PASSWORD_MAX,
    `Use at most ${FIELD_LIMITS.PASSWORD_MAX} characters`,
  )
  .refine(
    (value) => PASSWORD_RULES.every((rule) => rule.test(value)),
    'Your password does not meet all the rules yet',
  );

const code = z
  .string()
  .regex(
    new RegExp(`^\\d{${FIELD_LIMITS.CODE_LENGTH}}$`),
    `Enter the ${FIELD_LIMITS.CODE_LENGTH}-digit code`,
  );

export const signInSchema = z.object({
  email,
  // Only "not empty": the rules may have changed since the account was made.
  password: z.string().min(1, 'Enter your password'),
});

export const signUpSchema = z.object({ name, email, password: newPassword });

export const emailOnlySchema = z.object({ email });

export const codeSchema = z.object({ code });

export const resetPasswordSchema = z.object({ code, password: newPassword });

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  // ISO 8601. Optional so a page loaded before an API release still works.
  createdAt: z.string().optional(),
});

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type EmailOnlyValues = z.infer<typeof emailOnlySchema>;
export type CodeValues = z.infer<typeof codeSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type User = z.infer<typeof userSchema>;

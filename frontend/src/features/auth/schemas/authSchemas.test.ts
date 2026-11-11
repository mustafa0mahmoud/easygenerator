import { describe, expect, it } from 'vitest';
import {
  codeSchema,
  emailOnlySchema,
  signUpSchema,
  userSchema,
} from './authSchemas.ts';

const valid = {
  name: 'Sara',
  email: 'sara@example.com',
  password: 'Passw0rd!',
};
const accepts = (overrides: object) =>
  signUpSchema.safeParse({ ...valid, ...overrides }).success;

describe('auth schemas (the same rules as the API)', () => {
  it('trims and lowercases the email', () => {
    expect(emailOnlySchema.parse({ email: '  Sara@Example.COM ' })).toEqual({
      email: 'sara@example.com',
    });
  });

  it.each(['', 'sara', 'sara@', '@example.com', `${'a'.repeat(250)}@b.co`])(
    'rejects the email %j',
    (email) => {
      expect(accepts({ email })).toBe(false);
    },
  );

  it('requires a name of 3 to 100 characters after trimming', () => {
    expect(accepts({ name: 'Al' })).toBe(false);
    expect(accepts({ name: '  Al  ' })).toBe(false);
    expect(accepts({ name: 'Ali' })).toBe(true);
    expect(accepts({ name: 'a'.repeat(101) })).toBe(false);
  });

  it.each([
    ['too short', 'Pa0!'],
    ['no letter', '12345678!'],
    ['no number', 'Password!'],
    ['no special character', 'Passw0rd1'],
    ['longer than 128', `Aa1!${'x'.repeat(125)}`],
  ])('rejects a password that is %s', (_reason, password) => {
    expect(accepts({ password })).toBe(false);
  });

  it('accepts spaces and non-Latin letters in a password, untrimmed', () => {
    expect(accepts({ password: ' كلمة سر 1! ' })).toBe(true);
    expect(
      signUpSchema.parse({ ...valid, password: ' Passw0rd! ' }).password,
    ).toBe(' Passw0rd! ');
  });

  it('accepts exactly six digits as a code', () => {
    expect(codeSchema.safeParse({ code: '123456' }).success).toBe(true);
    for (const code of ['12345', '1234567', '12345a', ' 123456']) {
      expect(codeSchema.safeParse({ code }).success).toBe(false);
    }
  });

  it('rejects a user payload of the wrong shape', () => {
    expect(userSchema.safeParse({ id: 1, email: 'a@b.co' }).success).toBe(
      false,
    );
  });
});

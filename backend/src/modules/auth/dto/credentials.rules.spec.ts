import {
  emailRule,
  nameRule,
  oneTimeCodeRule,
  passwordRule,
} from './credentials.rules.js';
import { signupSchema } from './signup.dto.js';

const messages = (result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => result.error?.issues.map((issue) => issue.message) ?? [];

describe('emailRule', () => {
  it.each(['user@example.com', 'first.last+tag@sub.example.co.uk'])(
    'accepts %s',
    (email) => {
      expect(emailRule.safeParse(email).success).toBe(true);
    },
  );

  it('normalises case and surrounding whitespace', () => {
    expect(emailRule.parse('  User@Example.COM ')).toBe('user@example.com');
  });

  it.each([
    '',
    'plainaddress',
    'user@',
    '@example.com',
    'user@example',
    'a b@example.com',
  ])('rejects "%s"', (email) => {
    expect(emailRule.safeParse(email).success).toBe(false);
  });

  it('rejects an address longer than 254 characters', () => {
    const email = `${'a'.repeat(250)}@example.com`;

    expect(emailRule.safeParse(email).success).toBe(false);
  });

  it.each([undefined, null, 42, {}, ['a@b.co']])(
    'rejects the non-string value %j',
    (value) => {
      expect(emailRule.safeParse(value).success).toBe(false);
    },
  );
});

describe('nameRule', () => {
  it('accepts a 3-character name', () => {
    expect(nameRule.parse('Ali')).toBe('Ali');
  });

  it('accepts non-Latin names', () => {
    expect(nameRule.safeParse('مصطفى محمود').success).toBe(true);
  });

  it('trims before measuring, so padding cannot satisfy the minimum', () => {
    expect(nameRule.safeParse(' ab ').success).toBe(false);
    expect(nameRule.parse('  Sara  ')).toBe('Sara');
  });

  it('rejects a name shorter than 3 characters', () => {
    expect(nameRule.safeParse('Al').success).toBe(false);
  });

  it('rejects a name longer than 100 characters', () => {
    expect(nameRule.safeParse('a'.repeat(101)).success).toBe(false);
  });
});

describe('passwordRule', () => {
  it.each(['Passw0rd!', 'a1!aaaaa', 'pass word 1!', 'كلمةسر1!!'])(
    'accepts %s',
    (password) => {
      expect(passwordRule.safeParse(password).success).toBe(true);
    },
  );

  it('does not trim: spaces are part of the password', () => {
    expect(passwordRule.parse(' Passw0rd! ')).toBe(' Passw0rd! ');
  });

  it.each([
    [
      'shorter than 8 characters',
      'Ab1!',
      'Password must be at least 8 characters',
    ],
    [
      'without a letter',
      '12345678!',
      'Password must contain at least one letter',
    ],
    [
      'without a number',
      'Password!',
      'Password must contain at least one number',
    ],
    [
      'without a special character',
      'Password1',
      'Password must contain at least one special character',
    ],
    [
      'where the only non-alphanumeric is a space',
      'Password 1',
      'Password must contain at least one special character',
    ],
  ])('rejects a password %s', (_label, password, expectedMessage) => {
    const result = passwordRule.safeParse(password);

    expect(result.success).toBe(false);
    expect(messages(result)).toContain(expectedMessage);
  });

  it('rejects a password longer than 128 characters', () => {
    expect(passwordRule.safeParse(`A1!${'a'.repeat(126)}`).success).toBe(false);
  });

  it('accepts exactly 8 and exactly 128 characters', () => {
    expect(passwordRule.safeParse('Abcde1!x').success).toBe(true);
    expect(passwordRule.safeParse(`A1!${'a'.repeat(125)}`).success).toBe(true);
  });
});

describe('oneTimeCodeRule', () => {
  it('accepts six digits, including leading zeros', () => {
    expect(oneTimeCodeRule.safeParse('004271').success).toBe(true);
  });

  it.each(['12345', '1234567', '12a456', ' 123456', '', 123456])(
    'rejects %j',
    (code) => {
      expect(oneTimeCodeRule.safeParse(code).success).toBe(false);
    },
  );
});

describe('signupSchema', () => {
  const valid = {
    email: 'user@example.com',
    name: 'Sara',
    password: 'Passw0rd!',
  };

  it('accepts a valid payload', () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects unknown properties instead of silently dropping them', () => {
    expect(
      signupSchema.safeParse({ ...valid, emailVerifiedAt: new Date() }).success,
    ).toBe(false);
    expect(signupSchema.safeParse({ ...valid, role: 'admin' }).success).toBe(
      false,
    );
  });

  it('reports every invalid field', () => {
    const result = signupSchema.safeParse({
      email: 'nope',
      name: 'x',
      password: 'short',
    });

    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path[0]);
    expect(paths).toEqual(
      expect.arrayContaining(['email', 'name', 'password']),
    );
  });
});

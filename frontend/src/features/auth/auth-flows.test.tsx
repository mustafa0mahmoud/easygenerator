import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiError,
  mockApi,
  renderApp,
  SIGNED_IN,
  SIGNED_OUT,
  USER,
} from '../../test/app.tsx';

const heading = (name: string) => screen.findByRole('heading', { name });
const VALID_PASSWORD = 'Passw0rd!';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function typeCode(
  user: ReturnType<typeof renderApp>['user'],
  code: string,
) {
  await user.click(screen.getByLabelText('Digit 1 of 6'));
  await user.keyboard(code);
}

describe('route guards', () => {
  it('sends a visitor who is not signed in to the sign-in page', async () => {
    mockApi(SIGNED_OUT);
    renderApp('/');

    expect(await heading('Sign in')).toBeInTheDocument();
  });

  it('shows the application to a signed-in user', async () => {
    mockApi(SIGNED_IN);
    renderApp('/');

    expect(await heading('Welcome to the application.')).toBeInTheDocument();
  });

  it.each(['/sign-in', '/sign-up', '/forgot-password'])(
    'sends a signed-in user away from %s',
    async (path) => {
      mockApi(SIGNED_IN);
      renderApp(path);

      expect(await heading('Welcome to the application.')).toBeInTheDocument();
    },
  );

  it('does not guess "signed out" when the server is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    renderApp('/');

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Could not reach the server' },
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
  });
});

describe('sign in', () => {
  it('signs in and opens the application', async () => {
    const api = mockApi({
      ...SIGNED_OUT,
      'POST /auth/login': { status: 200, body: { user: USER } },
    });
    const { user } = renderApp('/sign-in');

    await user.type(
      await screen.findByLabelText('Email'),
      ' Sara@Example.com ',
    );
    await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await heading('Welcome to the application.')).toBeInTheDocument();
    // Normalised the way the API normalises it.
    expect(api.bodiesOf('POST /auth/login')).toEqual([
      { email: 'sara@example.com', password: VALID_PASSWORD },
    ]);
  });

  it('validates the fields before calling the API', async () => {
    const api = mockApi(SIGNED_OUT);
    const { user } = renderApp('/sign-in');

    await user.type(await screen.findByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText('Enter a valid email address'),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(api.bodiesOf('POST /auth/login')).toHaveLength(0);
  });

  it('shows the API message for wrong credentials and stays on the page', async () => {
    const api = mockApi({
      ...SIGNED_OUT,
      'POST /auth/login': apiError(401, 'Invalid email or password.'),
    });
    const { user } = renderApp('/sign-in');

    await user.type(await screen.findByLabelText('Email'), USER.email);
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password.',
    );
    expect(
      screen.getByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
    // A wrong password is an answer, not an expired session: no refresh,
    // beyond the one made while checking the session on load.
    expect(api.bodiesOf('POST /auth/refresh')).toHaveLength(1);
  });

  it('sends an unverified user to the verification page with their address', async () => {
    mockApi({
      ...SIGNED_OUT,
      'POST /auth/login': apiError(
        403,
        'Email address is not verified.',
        'email_not_verified',
      ),
    });
    const { user } = renderApp('/sign-in');

    await user.type(await screen.findByLabelText('Email'), USER.email);
    await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await heading('Check your inbox')).toBeInTheDocument();
    expect(screen.getByText(USER.email)).toBeInTheDocument();
    // No code was requested from here, so a new one can be asked for at once.
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeEnabled();
  });

  it('blocks a second submission while the first is in flight', async () => {
    let release = (_reply: { status: number; body: unknown }) => {};
    const api = mockApi({
      ...SIGNED_OUT,
      'POST /auth/login': () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const { user } = renderApp('/sign-in');

    await user.type(await screen.findByLabelText('Email'), USER.email);
    await user.type(
      screen.getByLabelText('Password'),
      `${VALID_PASSWORD}{Enter}`,
    );

    const button = await screen.findByRole('button', { name: 'Sign in' });
    await waitFor(() => expect(button).toBeDisabled());
    await user.type(screen.getByLabelText('Password'), '{Enter}');
    release({ status: 200, body: { user: USER } });

    expect(await heading('Welcome to the application.')).toBeInTheDocument();
    expect(api.bodiesOf('POST /auth/login')).toHaveLength(1);
  });

  it('reports a server failure without showing its details', async () => {
    mockApi({
      ...SIGNED_OUT,
      'POST /auth/login': apiError(500, 'MongoServerError: pool destroyed'),
    });
    const { user } = renderApp('/sign-in');

    await user.type(await screen.findByLabelText('Email'), USER.email);
    await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong on our side. Please try again.',
    );
    expect(screen.queryByText(/Mongo/)).toBeNull();
  });

  it('can reveal and hide the password', async () => {
    mockApi(SIGNED_OUT);
    const { user } = renderApp('/sign-in');
    const password = await screen.findByLabelText('Password');

    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
  });
});

describe('sign out', () => {
  it('ends the session and returns to the sign-in page', async () => {
    const api = mockApi({
      ...SIGNED_IN,
      'POST /auth/logout': { status: 204 },
    });
    const { user } = renderApp('/');

    await user.click(
      await screen.findByRole('button', { name: 'Account menu' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));

    expect(await heading('Sign in')).toBeInTheDocument();
    expect(api.bodiesOf('POST /auth/logout')).toHaveLength(1);
  });

  it('stays signed in and says so when sign-out fails', async () => {
    mockApi({
      ...SIGNED_IN,
      'POST /auth/logout': apiError(503, 'Service Unavailable'),
    });
    const { user } = renderApp('/');

    await user.click(
      await screen.findByRole('button', { name: 'Account menu' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong on our side.',
    );
    expect(
      screen.getByRole('heading', { name: 'Welcome to the application.' }),
    ).toBeInTheDocument();
  });
});

describe('sign up and email verification', () => {
  it('ticks each password rule as it is met', async () => {
    mockApi(SIGNED_OUT);
    const { user } = renderApp('/sign-up');
    const rule = (label: string) => screen.getByText(label).closest('li');

    await user.type(await screen.findByLabelText('Password'), 'abc');
    expect(rule('One letter')).toHaveAttribute('data-met', 'true');
    expect(rule('8 characters or more')).toHaveAttribute('data-met', 'false');
    expect(rule('One number')).toHaveAttribute('data-met', 'false');

    await user.type(screen.getByLabelText('Password'), 'defg1!');
    for (const label of [
      '8 characters or more',
      'One letter',
      'One number',
      'One special character',
    ]) {
      expect(rule(label)).toHaveAttribute('data-met', 'true');
    }
  });

  it('rejects a weak password and a short name before calling the API', async () => {
    const api = mockApi(SIGNED_OUT);
    const { user } = renderApp('/sign-up');

    await user.type(await screen.findByLabelText('Name'), 'Al');
    await user.type(screen.getByLabelText('Email'), USER.email);
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('Enter at least 3 characters'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your password does not meet all the rules yet'),
    ).toBeInTheDocument();
    expect(api.bodiesOf('POST /auth/signup')).toHaveLength(0);
  });

  it('says so when the address is already registered', async () => {
    mockApi({
      ...SIGNED_OUT,
      'POST /auth/signup': apiError(
        409,
        'This email address is already registered.',
      ),
    });
    const { user } = renderApp('/sign-up');

    await user.type(await screen.findByLabelText('Name'), USER.name);
    await user.type(screen.getByLabelText('Email'), USER.email);
    await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('This email address is already registered.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('creates the account, verifies the code and lands on sign-in', async () => {
    const api = mockApi({
      ...SIGNED_OUT,
      'POST /auth/signup': { status: 201, body: { message: 'ok' } },
      'POST /auth/verify-email': { status: 200, body: { message: 'ok' } },
    });
    const { user } = renderApp('/sign-up');

    await user.type(await screen.findByLabelText('Name'), USER.name);
    await user.type(screen.getByLabelText('Email'), USER.email);
    await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await heading('Check your inbox')).toBeInTheDocument();
    expect(screen.getByText(USER.email)).toBeInTheDocument();
    // A code was just sent: asking for another is locked for a minute.
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeDisabled();
    expect(screen.getByRole('timer')).toHaveTextContent(/0:(60|59)/);

    await typeCode(user, '123456');
    await user.click(screen.getByRole('button', { name: 'Verify email' }));

    expect(await heading('Sign in')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Email verified. You can now sign in.',
    );
    expect(api.bodiesOf('POST /auth/verify-email')).toEqual([
      { email: USER.email, code: '123456' },
    ]);
    expect(sessionStorage.getItem('auth.pending.verify-email')).toBeNull();
  });

  it('keeps the address and the countdown across a reload', async () => {
    sessionStorage.setItem(
      'auth.pending.verify-email',
      JSON.stringify({ email: USER.email, sentAt: Date.now() - 20_000 }),
    );
    mockApi(SIGNED_OUT);
    renderApp('/verify-email');

    expect(await screen.findByText(USER.email)).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent(/0:(40|39)/);
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeDisabled();
  });

  it('refuses an incomplete code without calling the API', async () => {
    sessionStorage.setItem(
      'auth.pending.verify-email',
      JSON.stringify({ email: USER.email, sentAt: 0 }),
    );
    const api = mockApi(SIGNED_OUT);
    const { user } = renderApp('/verify-email');

    await screen.findByText(USER.email);
    await typeCode(user, '123');
    await user.click(screen.getByRole('button', { name: 'Verify email' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter the 6-digit code',
    );
    expect(api.bodiesOf('POST /auth/verify-email')).toHaveLength(0);
  });

  it('shows a wrong-code error and clears the boxes', async () => {
    sessionStorage.setItem(
      'auth.pending.verify-email',
      JSON.stringify({ email: USER.email, sentAt: 0 }),
    );
    mockApi({
      ...SIGNED_OUT,
      'POST /auth/verify-email': apiError(
        400,
        'Invalid or expired verification code.',
      ),
    });
    const { user } = renderApp('/verify-email');

    await screen.findByText(USER.email);
    await typeCode(user, '000000');
    await user.click(screen.getByRole('button', { name: 'Verify email' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid or expired verification code.',
    );
    expect(screen.getByLabelText('Digit 1 of 6')).toHaveValue('');
  });

  it('resends a code once, then locks the button for a minute', async () => {
    sessionStorage.setItem(
      'auth.pending.verify-email',
      JSON.stringify({ email: USER.email, sentAt: 0 }),
    );
    const api = mockApi({
      ...SIGNED_OUT,
      'POST /auth/resend-verification': {
        status: 202,
        body: { message: 'ok' },
      },
    });
    const { user } = renderApp('/verify-email');

    await user.click(
      await screen.findByRole('button', { name: 'Resend code' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'A new code is on its way.',
    );
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeDisabled();
    expect(api.bodiesOf('POST /auth/resend-verification')).toEqual([
      { email: USER.email },
    ]);
  });

  it('explains a rate limit in plain words', async () => {
    sessionStorage.setItem(
      'auth.pending.verify-email',
      JSON.stringify({ email: USER.email, sentAt: 0 }),
    );
    mockApi({
      ...SIGNED_OUT,
      'POST /auth/resend-verification': apiError(
        429,
        'ThrottlerException: Too Many Requests',
      ),
    });
    const { user } = renderApp('/verify-email');

    await user.click(
      await screen.findByRole('button', { name: 'Resend code' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Please wait a minute and try again.',
    );
  });

  it('sends a visitor with no pending address back to sign-up', async () => {
    mockApi(SIGNED_OUT);
    renderApp('/verify-email');

    expect(await heading('Create your account')).toBeInTheDocument();
  });

  it('ignores stored data that is not in the expected shape', async () => {
    sessionStorage.setItem('auth.pending.verify-email', '{"email":42}');
    mockApi(SIGNED_OUT);
    renderApp('/verify-email');

    expect(await heading('Create your account')).toBeInTheDocument();
  });
});

describe('password reset', () => {
  it('asks for a code, sets a new password and lands on sign-in', async () => {
    const api = mockApi({
      ...SIGNED_OUT,
      'POST /auth/forgot-password': { status: 202, body: { message: 'ok' } },
      'POST /auth/reset-password': { status: 200, body: { message: 'ok' } },
    });
    const { user } = renderApp('/forgot-password');

    await user.type(await screen.findByLabelText('Email'), USER.email);
    await user.click(screen.getByRole('button', { name: 'Send reset code' }));

    expect(await heading('Choose a new password')).toBeInTheDocument();
    expect(screen.getByText(USER.email)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeDisabled();

    await typeCode(user, '654321');
    await user.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await heading('Sign in')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Password changed. Sign in with your new password.',
    );
    expect(api.bodiesOf('POST /auth/reset-password')).toEqual([
      { email: USER.email, code: '654321', password: VALID_PASSWORD },
    ]);
    expect(sessionStorage.getItem('auth.pending.reset-password')).toBeNull();
  });

  it('checks the code and the password before calling the API', async () => {
    sessionStorage.setItem(
      'auth.pending.reset-password',
      JSON.stringify({ email: USER.email, sentAt: 0 }),
    );
    const api = mockApi(SIGNED_OUT);
    const { user } = renderApp('/reset-password');

    await user.type(await screen.findByLabelText('New password'), 'weak');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(
      await screen.findByText('Enter the 6-digit code'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your password does not meet all the rules yet'),
    ).toBeInTheDocument();
    expect(api.bodiesOf('POST /auth/reset-password')).toHaveLength(0);
  });

  it('shows a wrong-code error and keeps the new password', async () => {
    sessionStorage.setItem(
      'auth.pending.reset-password',
      JSON.stringify({ email: USER.email, sentAt: 0 }),
    );
    mockApi({
      ...SIGNED_OUT,
      'POST /auth/reset-password': apiError(
        400,
        'Invalid or expired reset code.',
      ),
    });
    const { user } = renderApp('/reset-password');

    await screen.findByText(USER.email);
    await typeCode(user, '000000');
    await user.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid or expired reset code.',
    );
    expect(screen.getByLabelText('Digit 1 of 6')).toHaveValue('');
    expect(screen.getByLabelText('New password')).toHaveValue(VALID_PASSWORD);
  });

  it('sends a visitor who never asked for a code to the first step', async () => {
    mockApi(SIGNED_OUT);
    renderApp('/reset-password');

    expect(await heading('Forgot your password?')).toBeInTheDocument();
  });
});

describe('unknown URL', () => {
  it('shows the not-found page', async () => {
    mockApi(SIGNED_OUT);
    renderApp('/no-such-page');

    expect(await heading('Page not found')).toBeInTheDocument();
  });
});

describe('accessibility of page changes', () => {
  it('names each page in the document title and focuses its heading', async () => {
    mockApi(SIGNED_OUT);
    const { user } = renderApp('/sign-in');

    const signIn = await heading('Sign in');
    await waitFor(() => expect(signIn).toHaveFocus());
    expect(document.title).toBe('Sign in · Account');

    await user.click(screen.getByRole('link', { name: 'Create an account' }));

    const signUp = await heading('Create your account');
    await waitFor(() => expect(signUp).toHaveFocus());
    expect(document.title).toBe('Create your account · Account');
  });

  it('labels the card with its heading', async () => {
    mockApi(SIGNED_OUT);
    renderApp('/forgot-password');

    expect(
      await screen.findByRole('region', { name: 'Forgot your password?' }),
    ).toBeInTheDocument();
  });

  it('moves focus to the first invalid field on a rejected submit', async () => {
    mockApi(SIGNED_OUT);
    const { user } = renderApp('/sign-up');

    await user.click(
      await screen.findByRole('button', { name: 'Create account' }),
    );

    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveFocus());
  });
});

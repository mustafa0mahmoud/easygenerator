import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mockApi,
  renderApp,
  SIGNED_IN,
  SIGNED_OUT,
  USER,
} from '../../../test/app.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The value shown next to a label in the details list. */
function valueOf(label: string) {
  const term = screen.getByText(label, { selector: 'dt' });
  const row = term.parentElement;
  if (!row) throw new Error(`No row found for "${label}"`);
  return within(row).getByRole('definition');
}

describe('profile page', () => {
  it('shows what the API returned for the signed-in user', async () => {
    const api = mockApi(SIGNED_IN);
    renderApp('/profile');

    const title = await screen.findByRole('heading', { name: USER.name });

    expect(valueOf('Name')).toHaveTextContent(USER.name);
    expect(valueOf('Email')).toHaveTextContent(USER.email);
    expect(valueOf('Account ID')).toHaveTextContent(USER.id);
    expect(valueOf('Member since')).toHaveTextContent('9 March 2026');
    expect(
      within(valueOf('Member since')).getByText('9 March 2026'),
    ).toHaveAttribute('datetime', USER.createdAt);

    await waitFor(() => expect(title).toHaveFocus());
    expect(document.title).toBe('Profile · Account');
    expect(screen.getByRole('region', { name: USER.name })).toBeInTheDocument();
    // Read from the cached session: one request, not one per page.
    expect(api.calls.map((call) => call.key)).toEqual(['GET /users/me']);
  });

  it.each([
    ['is missing', undefined],
    ['is not a date', 'yesterday'],
  ])('leaves the date out when it %s', async (_case, createdAt) => {
    mockApi({
      'GET /users/me': { status: 200, body: { ...USER, createdAt } },
    });
    renderApp('/profile');

    await screen.findByRole('heading', { name: USER.name });

    expect(screen.queryByText('Member since')).toBeNull();
    expect(valueOf('Email')).toHaveTextContent(USER.email);
  });

  it('goes back to the application', async () => {
    mockApi(SIGNED_IN);
    const { user } = renderApp('/profile');

    await user.click(await screen.findByRole('link', { name: 'Back' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Welcome to the application.',
      }),
    ).toBeInTheDocument();
  });

  it('sends a visitor who is not signed in to the sign-in page', async () => {
    mockApi(SIGNED_OUT);
    renderApp('/profile');

    expect(
      await screen.findByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(USER.email)).toBeNull();
  });
});

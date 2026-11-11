import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp, SIGNED_IN, USER } from '../../../test/app.tsx';
import { initialsOf } from './initials.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

const menuButton = () => screen.findByRole('button', { name: 'Account menu' });

async function openMenu() {
  mockApi(SIGNED_IN);
  const { user } = renderApp('/');
  const button = await menuButton();
  await user.click(button);
  return { user, button, menu: screen.getByRole('menu', { name: 'Account' }) };
}

describe('account menu', () => {
  it('is closed at first and says so to assistive technology', async () => {
    mockApi(SIGNED_IN);
    renderApp('/');

    const button = await menuButton();

    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens with the user and two actions, focus on the first', async () => {
    const { button, menu } = await openMenu();

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', menu.id);
    expect(within(menu).getByText(USER.name)).toBeInTheDocument();
    expect(within(menu).getByText(USER.email)).toBeInTheDocument();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Profile', 'Log out']);
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveFocus();
  });

  it('moves between the items with the arrow keys, Home and End', async () => {
    const { user } = await openMenu();
    const profile = screen.getByRole('menuitem', { name: 'Profile' });
    const logOut = screen.getByRole('menuitem', { name: 'Log out' });

    await user.keyboard('{ArrowDown}');
    expect(logOut).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(profile).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(logOut).toHaveFocus();
    await user.keyboard('{Home}');
    expect(profile).toHaveFocus();
    await user.keyboard('{End}');
    expect(logOut).toHaveFocus();
  });

  it('closes on Escape and gives focus back to the button', async () => {
    const { user, button } = await openMenu();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('closes on a press outside, on Tab, and on a second press of the button', async () => {
    const { user, button } = await openMenu();

    await user.click(
      screen.getByRole('heading', { name: 'Welcome to the application.' }),
    );
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(button);
    await user.tab();
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(button);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(button);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens the profile page and closes itself', async () => {
    const { user } = await openMenu();

    await user.click(screen.getByRole('menuitem', { name: 'Profile' }));

    expect(
      await screen.findByRole('heading', { name: USER.name }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('menu')).toBeNull();
    // The bar belongs to the layout, so it is still there on the new page.
    expect(await menuButton()).toBeInTheDocument();
  });

  it('blocks a second log-out while the first is in flight', async () => {
    let release: () => void = () => {};
    const api = mockApi({
      ...SIGNED_IN,
      'POST /auth/logout': () =>
        new Promise((resolve) => {
          release = () => resolve({ status: 204 });
        }),
    });
    const { user } = renderApp('/');
    await user.click(await menuButton());

    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));
    const pending = await screen.findByRole('menuitem', {
      name: 'Logging out…',
    });
    expect(pending).toBeDisabled();
    await user.click(pending);
    release();

    expect(
      await screen.findByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
    expect(api.bodiesOf('POST /auth/logout')).toHaveLength(1);
  });

  it('is not shown on the pages for visitors', async () => {
    mockApi({
      'GET /users/me': { status: 401, body: {} },
      'POST /auth/refresh': { status: 401, body: {} },
    });
    renderApp('/sign-in');

    await screen.findByRole('heading', { name: 'Sign in' });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Account menu' })).toBeNull(),
    );
  });
});

describe('initials', () => {
  it.each([
    ['Sara', 'S'],
    ['sara ahmed', 'SA'],
    ['  Sara   Mohamed  Ahmed ', 'SA'],
    ['سارة أحمد', 'سأ'],
    ['', '?'],
    ['   ', '?'],
  ])('of %j are %j', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});

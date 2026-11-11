import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextField } from '../TextField.tsx';
import { Owl } from './Owl.tsx';
import { owlReact } from './owlReactions.ts';

function Scene() {
  return (
    <>
      <Owl />
      <TextField label="Email" type="email" />
      <TextField label="Password" type="password" />
    </>
  );
}

const owl = () => screen.getByRole('button', { name: 'Owl mascot' });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Owl', () => {
  it('covers its eyes while a hidden password is being typed', async () => {
    const user = userEvent.setup();
    render(<Scene />);

    await user.click(screen.getByLabelText('Password'));
    expect(owl()).toHaveClass('owl-shy');

    await user.click(screen.getByLabelText('Email'));
    expect(owl()).not.toHaveClass('owl-shy');
  });

  it('peeks when the password is revealed, and hides again when it is not', async () => {
    const user = userEvent.setup();
    render(<Scene />);
    const password = screen.getByLabelText('Password');

    await user.click(password);
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    await user.click(password);
    expect(owl()).toHaveClass('owl-peek');
    expect(owl()).not.toHaveClass('owl-shy');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    await user.click(password);
    expect(owl()).toHaveClass('owl-shy');
  });

  it('follows the text in an ordinary field without reading it', async () => {
    const user = userEvent.setup();
    render(<Scene />);
    const pupil = owl().querySelector<SVGGElement>('[data-owl-pupil]');

    await user.type(screen.getByLabelText('Email'), 'sara@example.com');

    expect(pupil?.style.transform).toMatch(/^translate\(/);
    expect(owl().outerHTML).not.toContain('sara@example.com');
  });

  it('flaps and hops when pressed, with the mouse or the keyboard', async () => {
    const user = userEvent.setup();
    render(<Scene />);

    await user.click(owl());
    expect(owl()).toHaveClass('owl-flying', 'owl-yes');

    owl().focus();
    await user.keyboard('{Enter}');
    expect(owl()).toHaveClass('owl-flying');
  });

  it('reacts to an outcome reported from anywhere', () => {
    render(<Scene />);

    act(() => owlReact('no'));
    expect(owl()).toHaveClass('owl-no');

    act(() => owlReact('yes'));
    expect(owl()).toHaveClass('owl-yes');
  });

  it('replays a reaction fired just before the page changed', () => {
    owlReact('yes');
    render(<Scene />);

    expect(owl()).toHaveClass('owl-yes');
  });

  it('blinks on its own, and stops every timer when it leaves the page', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { unmount } = render(<Scene />);

    act(() => void vi.advanceTimersByTime(2_400));
    expect(owl()).toHaveClass('owl-blink');
    act(() => void vi.advanceTimersByTime(140));
    expect(owl()).not.toHaveClass('owl-blink');

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stays still for a visitor who asked for reduced motion', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Scene />);

    await user.click(owl());
    act(() => void vi.advanceTimersByTime(10_000));

    expect(owl()).not.toHaveClass('owl-flying');
    expect(owl()).not.toHaveClass('owl-blink');
  });
});

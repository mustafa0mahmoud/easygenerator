import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { CodeInput } from './CodeInput.tsx';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <CodeInput label="Code" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

const box = (position: number) =>
  screen.getByLabelText(`Digit ${position} of 6`);
const value = () => screen.getByTestId('value').textContent;

describe('CodeInput', () => {
  it('fills box by box and moves the focus forward', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(box(1));
    await user.keyboard('12');

    expect(value()).toBe('12');
    expect(box(3)).toHaveFocus();
  });

  it('ignores anything that is not a digit', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(box(1));
    await user.keyboard('a1-b2 ');

    expect(value()).toBe('12');
  });

  it('never holds more than six digits', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(box(1));
    await user.keyboard('123456789');

    expect(value()).toBe('123456');
  });

  it('fills every box from a pasted code, dropping separators', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(box(1));
    await user.paste('123 456');

    expect(value()).toBe('123456');
    expect(box(6)).toHaveValue('6');
  });

  it('deletes backwards with Backspace', async () => {
    const user = userEvent.setup();
    render(<Harness initial="123" />);

    await user.click(box(4));
    await user.keyboard('{Backspace}');

    expect(value()).toBe('12');
    expect(box(3)).toHaveFocus();
  });

  it('moves between boxes with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<Harness initial="123" />);

    await user.click(box(3));
    await user.keyboard('{ArrowLeft}');
    expect(box(2)).toHaveFocus();
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    // Not past the first empty box.
    expect(box(4)).toHaveFocus();
  });

  it('offers the code from an SMS or email to the first box only', () => {
    render(<Harness />);

    expect(box(1)).toHaveAttribute('autocomplete', 'one-time-code');
    expect(box(2)).toHaveAttribute('autocomplete', 'off');
    expect(box(1)).toHaveAttribute('inputmode', 'numeric');
  });
});

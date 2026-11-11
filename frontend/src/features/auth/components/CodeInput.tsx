import {
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import { FIELD_LIMITS } from '../schemas/authSchemas.ts';

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  invalid?: boolean;
  disabled?: boolean;
}

const LENGTH = FIELD_LIMITS.CODE_LENGTH;
const digitsOnly = (text: string) => text.replace(/\D/g, '').slice(0, LENGTH);

export function CodeInput({
  value,
  onChange,
  label,
  invalid = false,
  disabled = false,
}: CodeInputProps) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const focusBox = (index: number) =>
    boxes.current[Math.max(0, Math.min(LENGTH - 1, index))]?.focus();

  const handleChange =
    (index: number) => (event: ChangeEvent<HTMLInputElement>) => {
      const typed = digitsOnly(event.target.value);
      if (typed.length === 0) return;
      // More than one digit arrives when the browser auto-fills the code.
      const next = digitsOnly(value.slice(0, index) + typed);
      onChange(next);
      focusBox(next.length);
    };

  const handleKeyDown =
    (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Backspace') {
        event.preventDefault();
        const removeAt = index < value.length ? index : value.length - 1;
        if (removeAt < 0) return;
        onChange(value.slice(0, removeAt));
        focusBox(removeAt);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        focusBox(index - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        focusBox(Math.min(index + 1, value.length));
      }
    };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = digitsOnly(event.clipboardData.getData('text'));
    if (pasted.length === 0) return;
    onChange(pasted);
    focusBox(pasted.length);
  };

  return (
    <fieldset
      aria-label={label}
      className="grid min-w-0 grid-cols-6 gap-2 max-[460px]:gap-1.5"
    >
      {Array.from({ length: LENGTH }, (_, index) => {
        const digit = value[index] ?? '';
        return (
          <input
            key={index}
            ref={(element) => {
              boxes.current[index] = element;
            }}
            value={digit}
            onChange={handleChange(index)}
            onKeyDown={handleKeyDown(index)}
            onPaste={handlePaste}
            onFocus={(event) => event.target.select()}
            disabled={disabled}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${index + 1} of ${LENGTH}`}
            aria-invalid={invalid || undefined}
            className={`h-[46px] w-full rounded-lg border bg-transparent p-0 text-center font-mono text-xl tabular-nums transition focus:border-ink-muted focus:shadow-[0_0_0_3px_rgba(255,255,255,0.07)] focus:outline-none ${
              invalid
                ? 'border-danger text-danger'
                : digit
                  ? 'border-ink-muted'
                  : 'border-line'
            }`}
          />
        );
      })}
    </fieldset>
  );
}

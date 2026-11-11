import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { EyeIcon, EyeOffIcon } from './icons.tsx';
import { PASSWORD_FIELD_ATTRIBUTE } from './owl/owlReactions.ts';

interface TextFieldProps extends ComponentProps<'input'> {
  label: string;
  icon?: ReactNode;
  error?: string;
  /** Rendered between the input and its error, such as a rule checklist. */
  children?: ReactNode;
}

const INPUT =
  'h-[38px] w-full rounded-lg border bg-transparent px-3.5 text-sm transition max-sm:h-11 max-sm:text-base placeholder:text-ink-dim focus:border-ink-muted focus:shadow-[0_0_0_3px_rgba(255,255,255,0.07)] focus:outline-none';

/** A labelled input whose error is announced and tied to the field. */
export function TextField({
  label,
  icon,
  error,
  children,
  type = 'text',
  className = '',
  ...inputProps
}: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const isPassword = type === 'password';
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-[7px] text-[13px] font-medium text-ink-muted"
      >
        {icon}
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...(isPassword ? { [PASSWORD_FIELD_ATTRIBUTE]: '' } : {})}
          className={`${INPUT} ${error ? 'border-danger' : 'border-line'} ${isPassword ? 'pr-11' : ''} ${className}`}
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            className="absolute top-[3px] right-[3px] grid size-8 place-items-center max-sm:top-1.5 max-sm:right-1.5 rounded-lg text-ink-muted hover:bg-white/[0.06] hover:text-ink"
          >
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      {children}
      {error && (
        <span id={errorId} role="alert" className="text-[13px] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

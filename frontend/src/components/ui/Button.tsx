import type { ComponentProps } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant;
  loading?: boolean;
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition disabled:cursor-not-allowed';

const VARIANTS: Record<Variant, string> = {
  primary:
    'h-[38px] w-full bg-ink text-[#111] hover:brightness-90 active:translate-y-px disabled:opacity-60',
  secondary:
    'h-[38px] border border-line bg-white/[0.03] px-[18px] hover:border-ink-dim hover:bg-white/[0.07] disabled:opacity-60',
  ghost:
    'h-[34px] border border-line px-3.5 text-[13px] hover:bg-white/[0.06] disabled:text-ink-dim disabled:hover:bg-transparent',
};

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  type = 'button',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current/30 border-t-current"
        />
      )}
      {children}
    </button>
  );
}

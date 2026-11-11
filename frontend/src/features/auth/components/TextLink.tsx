import { Link, type LinkProps } from 'react-router';

export function TextLink({ className = '', ...props }: LinkProps) {
  return (
    <Link
      className={`font-medium text-ink underline decoration-ink-dim underline-offset-[3px] hover:decoration-ink ${className}`}
      {...props}
    />
  );
}

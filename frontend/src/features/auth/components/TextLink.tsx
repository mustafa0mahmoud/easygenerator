import { Link, type LinkProps } from 'react-router';

/** An inline link in the card's own ink, underlined so it does not rely on colour. */
export function TextLink({ className = '', ...props }: LinkProps) {
  return (
    <Link
      className={`font-medium text-ink underline decoration-ink-dim underline-offset-[3px] hover:decoration-ink ${className}`}
      {...props}
    />
  );
}

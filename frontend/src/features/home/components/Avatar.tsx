import { initialsOf } from './initials.ts';

const SIZES = {
  sm: 'size-[34px] text-xs',
  lg: 'size-16 text-xl max-[480px]:size-[52px] max-[480px]:text-[17px]',
} as const;

export function Avatar({
  name,
  size = 'sm',
}: {
  name: string;
  size?: keyof typeof SIZES;
}) {
  return (
    <span
      aria-hidden="true"
      className={`grid flex-none place-items-center rounded-full border border-line bg-surface-lit font-semibold tracking-[0.02em] ${SIZES[size]}`}
    >
      {initialsOf(name)}
    </span>
  );
}

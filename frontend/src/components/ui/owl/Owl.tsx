import { useId } from 'react';
import { useOwl } from './useOwl.ts';

const EYES = [
  { cx: 42, lidX: 24 },
  { cx: 78, lidX: 60 },
] as const;

export function Owl({ className = '' }: { className?: string }) {
  const ref = useOwl<HTMLButtonElement>();
  const id = useId();

  return (
    <button
      ref={ref}
      type="button"
      aria-label="Owl mascot"
      className={`owl w-14 cursor-pointer rounded-lg ${className}`}
    >
      <svg viewBox="0 0 120 104" aria-hidden="true" focusable="false">
        <defs>
          {EYES.map(({ cx }) => (
            <clipPath key={cx} id={`${id}-eye-${cx}`}>
              <circle cx={cx} cy="46" r="17" />
            </clipPath>
          ))}
        </defs>
        <g className="fill-feather">
          <path d="M24 30 L22 8 L42 22 Z" />
          <path d="M96 30 L98 8 L78 22 Z" />
          <ellipse cx="60" cy="58" rx="40" ry="40" />
        </g>
        <ellipse cx="60" cy="76" rx="22" ry="19" className="fill-belly" />
        <g className="fill-ink-muted">
          <path d="M44 96 q4 -8 8 0 q4 -8 8 0 z" />
          <path d="M60 96 q4 -8 8 0 q4 -8 8 0 z" />
        </g>
        {EYES.map(({ cx, lidX }) => (
          <g key={cx} clipPath={`url(#${id}-eye-${cx})`}>
            <circle data-owl-disc cx={cx} cy="46" r="17" className="fill-ink" />
            <g data-owl-pupil className="owl-pupil">
              <circle cx={cx} cy="46" r="7.5" className="fill-canvas" />
              <circle cx={cx + 2.5} cy="43.5" r="2.2" className="fill-white" />
            </g>
            <rect
              x={lidX}
              y="28"
              width="36"
              height="36"
              className="owl-lid fill-feather-lit"
            />
          </g>
        ))}
        <path d="M55 56 L65 56 L60 66 Z" className="fill-ink-muted" />
        <ellipse
          cx="22"
          cy="72"
          rx="13"
          ry="23"
          className="owl-wing owl-wing-left fill-feather-lit"
        />
        <ellipse
          cx="98"
          cy="72"
          rx="13"
          ry="23"
          className="owl-wing owl-wing-right fill-feather-lit"
        />
      </svg>
    </button>
  );
}

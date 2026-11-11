import { Button } from '../../../components/ui/Button.tsx';
import { useCountdown } from '../hooks/useCountdown.ts';

/** The API refuses a second code for the same address within this window. */
export const RESEND_COOLDOWN_SECONDS = 60;

const MS_PER_SECOND = 1_000;
const RING_RADIUS = 17;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

interface ResendTimerProps {
  sentAt: number;
  onResend: () => void;
  isSending: boolean;
}

const formatTime = (seconds: number) => `0:${String(seconds).padStart(2, '0')}`;

export function ResendTimer({ sentAt, onResend, isSending }: ResendTimerProps) {
  // Capped: the clock reading can be a tick older than a fresh `sentAt`.
  const secondsLeft = Math.min(
    RESEND_COOLDOWN_SECONDS,
    useCountdown(sentAt + RESEND_COOLDOWN_SECONDS * MS_PER_SECOND),
  );
  const waiting = secondsLeft > 0;
  const elapsed = 1 - secondsLeft / RESEND_COOLDOWN_SECONDS;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
      {waiting && (
        <svg
          viewBox="0 0 40 40"
          aria-hidden="true"
          className="size-[38px] flex-none -rotate-90 fill-none stroke-[3]"
        >
          <circle cx="20" cy="20" r={RING_RADIUS} className="stroke-line" />
          <circle
            cx="20"
            cy="20"
            r={RING_RADIUS}
            strokeLinecap="round"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * elapsed}
            className="stroke-ink transition-[stroke-dashoffset] duration-300 ease-linear"
          />
        </svg>
      )}
      <div className="min-w-0 flex-1 text-[13px] text-ink-muted">
        {waiting ? (
          <>
            You can resend in
            <b
              role="timer"
              className="block font-mono text-[15px] font-semibold text-ink tabular-nums"
            >
              {formatTime(secondsLeft)}
            </b>
          </>
        ) : (
          'Did not get the code?'
        )}
      </div>
      <Button
        variant="ghost"
        onClick={onResend}
        disabled={waiting}
        loading={isSending}
      >
        Resend code
      </Button>
    </div>
  );
}

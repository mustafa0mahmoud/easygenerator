import { useEffect, useState } from 'react';

const TICK_MS = 250;
const MS_PER_SECOND = 1_000;

/**
 * Whole seconds left until `endsAt` (a timestamp). The value is derived from
 * the clock on every tick rather than decremented, so it stays right after a
 * reload, a sleeping tab or a throttled timer.
 */
export function useCountdown(endsAt: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt <= Date.now()) return undefined;

    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) clearInterval(timer);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [endsAt]);

  return Math.max(0, Math.ceil((endsAt - now) / MS_PER_SECOND));
}

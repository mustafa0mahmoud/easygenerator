import { useCallback, useState } from 'react';
import { z } from 'zod';

export type CodePurpose = 'verify-email' | 'reset-password';

const pendingCodeSchema = z.object({
  email: z.string().min(1),
  sentAt: z.number().nonnegative(),
});

export type PendingCode = z.infer<typeof pendingCodeSchema>;

const storageKey = (purpose: CodePurpose) => `auth.pending.${purpose}`;

/** Storage can be unavailable (private mode, blocked): never let that throw. */
function read(purpose: CodePurpose): PendingCode | null {
  try {
    const raw = sessionStorage.getItem(storageKey(purpose));
    if (raw === null) return null;
    const parsed = pendingCodeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function write(purpose: CodePurpose, value: PendingCode | null): void {
  try {
    if (value === null) sessionStorage.removeItem(storageKey(purpose));
    else sessionStorage.setItem(storageKey(purpose), JSON.stringify(value));
  } catch {
    // The flow still works for this page view; it just will not survive a reload.
  }
}

export function startPendingCode(
  purpose: CodePurpose,
  email: string,
  sentAt: number,
): void {
  write(purpose, { email, sentAt });
}

/**
 * Which address a code was sent to, and when. Kept in `sessionStorage` so the
 * code page survives a reload and the resend countdown does not restart; it
 * is gone when the tab closes. Only the address and a timestamp are stored,
 * never a password, a code or a token.
 */
export function usePendingCode(purpose: CodePurpose) {
  const [pending, setPending] = useState(() => read(purpose));

  const markSent = useCallback(() => {
    setPending((current) => {
      if (!current) return current;
      const next = { ...current, sentAt: Date.now() };
      write(purpose, next);
      return next;
    });
  }, [purpose]);

  const clear = useCallback(() => write(purpose, null), [purpose]);

  return { pending, markSent, clear };
}

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { FormMessage } from '../../../components/ui/FormMessage.tsx';
import {
  LogOutIcon,
  MenuIcon,
  UserIcon,
} from '../../../components/ui/icons.tsx';
import { toUserMessage } from '../../../lib/http/index.ts';
import { PATHS } from '../../../routes/paths.ts';
import { useSession, useSignOut } from '../../auth/index.ts';
import { Avatar } from './Avatar.tsx';

const ITEM_SELECTOR = '[role="menuitem"]:not(:disabled)';
const ITEM =
  'flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm hover:bg-surface-lit focus-visible:bg-surface-lit disabled:cursor-not-allowed disabled:opacity-60 max-[480px]:min-h-11';

/**
 * The button in the corner of every signed-in page, and the menu under it.
 *
 * Follows the menu-button pattern: the arrow keys, Home and End move between
 * the items, Escape closes the menu and returns focus to the button, and a
 * press anywhere else closes it. The menu is positioned with classes only;
 * the content security policy allows no inline styles.
 */
export function AccountMenu() {
  const { user } = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (open) {
      menuRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = ({ target }: PointerEvent) => {
      const pressedInside =
        target instanceof Node && rootRef.current?.contains(target);
      if (!pressedInside) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (!user) return null;

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(ITEM_SELECTOR),
    );
    const current = items.findIndex((item) => item === document.activeElement);
    const focusItem = (index: number) => {
      event.preventDefault();
      items[(index + items.length) % items.length]?.focus();
    };

    switch (event.key) {
      case 'Escape':
        setOpen(false);
        buttonRef.current?.focus();
        break;
      case 'ArrowDown':
        focusItem(current + 1);
        break;
      case 'ArrowUp':
        focusItem(current - 1);
        break;
      case 'Home':
        focusItem(0);
        break;
      case 'End':
        focusItem(items.length - 1);
        break;
      case 'Tab':
        // Focus is leaving anyway; a menu left open behind it would be stale.
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="grid size-[38px] place-items-center rounded-lg border border-line bg-surface transition hover:border-ink-dim hover:bg-surface-lit aria-expanded:border-ink-dim aria-expanded:bg-surface-lit"
      >
        <MenuIcon />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          tabIndex={-1}
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className="absolute top-[calc(100%+8px)] right-0 w-[min(248px,calc(100vw-24px))] origin-top-right animate-pop rounded-xl border border-line bg-surface p-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.6)]"
        >
          <div className="mb-1.5 flex min-w-0 items-center gap-2.5 border-b border-line px-2 pt-2 pb-2.5">
            <Avatar name={user.name} />
            <div className="min-w-0">
              <p className="m-0 truncate text-sm font-semibold">{user.name}</p>
              <p className="m-0 truncate text-xs text-ink-muted">
                {user.email}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="menuitem"
            className={ITEM}
            onClick={() => {
              setOpen(false);
              void navigate(PATHS.profile);
            }}
          >
            <span className="text-ink-muted">
              <UserIcon />
            </span>
            Profile
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={signOut.isPending}
            aria-busy={signOut.isPending || undefined}
            className={`${ITEM} text-danger`}
            onClick={() =>
              signOut.mutate(undefined, {
                onSuccess: () => navigate(PATHS.signIn, { replace: true }),
              })
            }
          >
            <LogOutIcon />
            {signOut.isPending ? 'Logging out…' : 'Log out'}
          </button>

          {signOut.isError && (
            <div className="px-1 pt-1.5 pb-1">
              <FormMessage tone="error">
                {toUserMessage(signOut.error)}
              </FormMessage>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

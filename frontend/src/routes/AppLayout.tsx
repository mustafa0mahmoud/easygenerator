import { Link, Outlet } from 'react-router';
import { AccountMenu } from '../features/home/index.ts';
import { PATHS } from './paths.ts';

/**
 * Frame of the pages behind sign-in: a bar with the product name on one side
 * and the account menu on the other, and the page below it.
 */
export function AppLayout() {
  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-canvas/85 px-[clamp(12px,3vw,24px)] backdrop-blur">
        <Link
          to={PATHS.home}
          className="-ml-2 rounded-lg px-2 py-1.5 text-sm font-semibold"
        >
          Account
        </Link>
        <AccountMenu />
      </header>
      <Outlet />
    </>
  );
}

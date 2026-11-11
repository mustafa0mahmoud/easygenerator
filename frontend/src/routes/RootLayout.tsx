import { Outlet, useNavigation } from 'react-router';

/**
 * Frame around every page. While the next page's code is downloading the
 * current page stays on screen, with a thin progress bar on top, instead of
 * being replaced by a blank loader.
 */
export function RootLayout() {
  const isNavigating = useNavigation().state !== 'idle';

  return (
    <>
      {isNavigating && (
        <>
          <progress aria-label="Loading page" className="sr-only" />
          <div
            aria-hidden="true"
            className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-ink-muted"
          />
        </>
      )}
      <Outlet />
    </>
  );
}

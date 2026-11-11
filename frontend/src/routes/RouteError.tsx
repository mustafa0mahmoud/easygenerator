/**
 * Last line of defence for an error thrown while loading or rendering a
 * route, including a page chunk that no longer exists after a new release.
 * Reloading fetches the current version. The error itself is not displayed:
 * it may contain details that are of no use, or of too much use, to a visitor.
 */
export function RouteError() {
  return (
    <main
      role="alert"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-ink-muted">
        The page could not be loaded. Please try again.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md border border-ink-muted px-4 py-2 text-sm hover:border-ink hover:text-ink"
      >
        Reload
      </button>
    </main>
  );
}

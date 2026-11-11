/** Shown while the first page's code is being downloaded. */
export function PageLoader() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-dvh items-center justify-center"
    >
      <span className="size-6 animate-spin rounded-full border-2 border-ink-muted border-t-transparent" />
    </div>
  );
}

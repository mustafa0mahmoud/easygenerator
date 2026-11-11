import { Navigate, Outlet } from 'react-router';
import { Button } from '../components/ui/Button.tsx';
import { PageLoader } from '../components/ui/PageLoader.tsx';
import { useSession } from '../features/auth/index.ts';
import { PATHS } from './paths.ts';

/**
 * These guards decide what to *show*. They are a convenience, not a
 * security boundary: the API refuses every protected request without a valid
 * session, whatever the browser renders.
 */

/** Pages for signed-in users. Nothing is rendered until the session is known. */
export function RequireAuth() {
  const { user, isLoading, isError, retry } = useSession();

  if (isLoading) return <PageLoader />;
  if (isError) return <SessionUnavailable onRetry={retry} />;
  if (!user) return <Navigate to={PATHS.signIn} replace />;
  return <Outlet />;
}

/** Sign-in, sign-up and the like: a signed-in user is sent to the application. */
export function GuestOnly() {
  const { user, isLoading } = useSession();

  if (isLoading) return <PageLoader />;
  if (user) return <Navigate to={PATHS.home} replace />;
  // If the session could not be checked the forms are still shown: the
  // request they make will report the problem.
  return <Outlet />;
}

/** The API could not be reached, so "signed out" would be a guess. */
function SessionUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <main
      role="alert"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <h1 className="text-xl font-semibold">Could not reach the server</h1>
      <p className="text-sm text-ink-muted">
        Check your connection and try again.
      </p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </main>
  );
}

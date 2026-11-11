import { Link } from 'react-router';
import { PATHS } from './paths.ts';

export default function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link
        to={PATHS.home}
        className="text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
      >
        Back to the application
      </Link>
    </main>
  );
}

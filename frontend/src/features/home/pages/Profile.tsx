import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useFocusOnMount } from '../../../components/ui/useFocusOnMount.ts';
import { PATHS } from '../../../routes/paths.ts';
import { useSession } from '../../auth/index.ts';
import { Avatar } from '../components/Avatar.tsx';

// One fixed format, to match the interface's language rather than the device's.
const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** `null` when the value is missing or is not a date. */
function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_1fr] items-baseline gap-3 border-b border-line py-3.5 last:border-b-0 max-[480px]:grid-cols-1 max-[480px]:gap-0.5 max-[480px]:py-3">
      <dt className="text-[13px] text-ink-faint">{label}</dt>
      <dd className="m-0 min-w-0 text-sm [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  );
}

/** What the API knows about the signed-in user, read from the cached session. */
export default function ProfilePage() {
  const { user } = useSession();
  const titleId = useId();
  const titleRef = useFocusOnMount<HTMLHeadingElement>();

  // The route guard only renders this page for a signed-in user.
  if (!user) return null;

  const createdAt = parseDate(user.createdAt);

  return (
    <main className="flex flex-col items-center px-4 pt-[clamp(28px,9vh,96px)] pb-10">
      <title>Profile · Account</title>
      <section
        aria-labelledby={titleId}
        className="w-full max-w-[440px] animate-rise rounded-xl border border-line bg-surface"
      >
        <div className="flex min-w-0 items-center gap-4 border-b border-line p-6 max-[480px]:gap-3.5 max-[480px]:px-[18px] max-[480px]:py-5">
          <Avatar name={user.name} size="lg" />
          <div className="min-w-0">
            <h1
              id={titleId}
              ref={titleRef}
              tabIndex={-1}
              className="m-0 text-xl leading-tight font-semibold [overflow-wrap:anywhere] outline-none"
            >
              {user.name}
            </h1>
            <p className="m-0 mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted">
              {user.email}
            </p>
          </div>
        </div>

        <dl className="m-0 px-6 py-1.5 max-[480px]:px-[18px] max-[480px]:py-1">
          <Row label="Name">{user.name}</Row>
          <Row label="Email">{user.email}</Row>
          {createdAt && (
            <Row label="Member since">
              <time dateTime={createdAt.toISOString()}>
                {DATE_FORMAT.format(createdAt)}
              </time>
            </Row>
          )}
          <Row label="Account ID">
            <span className="font-mono text-[12.5px] text-ink-muted">
              {user.id}
            </span>
          </Row>
        </dl>

        <div className="px-6 pt-4 pb-6 max-[480px]:px-[18px] max-[480px]:pt-3.5 max-[480px]:pb-5">
          <Link
            to={PATHS.home}
            className="flex h-[38px] items-center justify-center rounded-lg border border-line bg-white/[0.03] text-sm font-medium transition hover:border-ink-dim hover:bg-white/[0.07]"
          >
            Back
          </Link>
        </div>
      </section>
    </main>
  );
}

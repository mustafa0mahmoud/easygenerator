import { useId, type ReactNode, type Ref } from 'react';
import { Owl } from '../../../components/ui/owl/Owl.tsx';
import { useFocusOnMount } from '../../../hooks/useFocusOnMount.ts';

interface AuthCardProps {
  title: string;
  lede?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  cardRef?: Ref<HTMLElement>;
}

export function AuthCard({
  title,
  lede,
  footer,
  children,
  cardRef,
}: AuthCardProps) {
  const titleId = useId();
  const titleRef = useFocusOnMount<HTMLHeadingElement>();

  return (
    <main className="flex min-h-dvh flex-col items-center px-4 pt-[11vh] pb-10">
      <title>{`${title} · Account`}</title>
      <Owl className="mb-3.5" />
      <section
        ref={cardRef}
        aria-labelledby={titleId}
        className="w-full max-w-[384px] animate-rise rounded-xl border border-line bg-surface px-6 pt-[26px] pb-[22px] max-[460px]:px-[18px]"
      >
        <h1
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="mb-1.5 text-xl leading-tight font-semibold tracking-[-0.01em] text-balance outline-none"
        >
          {title}
        </h1>
        {lede ? (
          <p className="mb-[22px] text-sm text-ink-muted">{lede}</p>
        ) : (
          <div className="mb-4" />
        )}
        {children}
        {footer && (
          <p className="mt-5 text-center text-sm text-ink-muted">{footer}</p>
        )}
      </section>
    </main>
  );
}

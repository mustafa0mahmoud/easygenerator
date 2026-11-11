interface FormMessageProps {
  tone: 'error' | 'success';
  children?: string | null;
}

const TONES = {
  error: 'border-danger/30 bg-danger/10 text-danger',
  success: 'border-ok/30 bg-ok/10 text-ok',
} as const;

export function FormMessage({ tone, children }: FormMessageProps) {
  if (!children) return null;
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`m-0 rounded-[10px] border px-3 py-2.5 text-[13px] ${TONES[tone]}`}
    >
      {children}
    </p>
  );
}

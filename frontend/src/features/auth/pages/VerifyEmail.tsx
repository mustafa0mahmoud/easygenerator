import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Button } from '../../../components/ui/Button.tsx';
import { FormMessage } from '../../../components/ui/FormMessage.tsx';
import { owlReact } from '../../../components/ui/owl/useOwl.ts';
import { toUserMessage } from '../../../lib/http/index.ts';
import { PATHS } from '../../../routes/paths.ts';
import { AuthCard } from '../components/AuthCard.tsx';
import { CodeInput } from '../components/CodeInput.tsx';
import { ResendTimer } from '../components/ResendTimer.tsx';
import { TextLink } from '../components/TextLink.tsx';
import { usePendingCode } from '../hooks/usePendingCode.ts';
import { useShake } from '../hooks/useShake.ts';
import { codeSchema } from '../schemas/authSchemas.ts';
import { authApi } from '../services/authApi.ts';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const { pending, markSent, clear } = usePendingCode('verify-email');
  const [cardRef, shake] = useShake<HTMLElement>();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  const verify = useMutation({
    mutationFn: (value: string) =>
      authApi.verifyEmail(pending?.email ?? '', value),
  });
  const resend = useMutation({
    mutationFn: () => authApi.resendVerification(pending?.email ?? ''),
    onSuccess: markSent,
  });

  // Reached without an address to verify (a bookmark, a new tab).
  if (!pending) return <Navigate to={PATHS.signUp} replace />;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (verify.isPending) return;

    const parsed = codeSchema.safeParse({ code });
    if (!parsed.success) {
      setCodeError(parsed.error.issues[0].message);
      shake();
      return;
    }
    setCodeError(null);
    verify.mutate(parsed.data.code, {
      onSuccess: () => {
        owlReact('yes');
        clear();
        void navigate(PATHS.signIn, {
          replace: true,
          state: { notice: 'Email verified. You can now sign in.' },
        });
      },
      onError: () => {
        setCode('');
        shake();
      },
    });
  };

  const error =
    codeError ??
    (verify.isError ? toUserMessage(verify.error) : null) ??
    (resend.isError ? toUserMessage(resend.error) : null);

  return (
    <AuthCard
      cardRef={cardRef}
      title="Check your inbox"
      lede={
        <>
          We sent a 6-digit code to{' '}
          <strong className="font-semibold [overflow-wrap:anywhere] text-ink">
            {pending.email}
          </strong>
          . It expires in 5 minutes.
        </>
      }
      footer={
        <>
          Wrong address? <TextLink to={PATHS.signUp}>Go back</TextLink>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {error ? (
          <FormMessage tone="error">{error}</FormMessage>
        ) : (
          <FormMessage tone="success">
            {resend.isSuccess ? 'A new code is on its way.' : null}
          </FormMessage>
        )}
        <CodeInput
          label="Verification code"
          value={code}
          onChange={(value) => {
            setCode(value);
            setCodeError(null);
          }}
          invalid={Boolean(codeError) || verify.isError}
          disabled={verify.isPending}
        />
        <Button type="submit" loading={verify.isPending} className="mt-1.5">
          Verify email
        </Button>
        <ResendTimer
          sentAt={pending.sentAt}
          onResend={() => {
            verify.reset();
            resend.mutate();
          }}
          isSending={resend.isPending}
        />
      </form>
    </AuthCard>
  );
}

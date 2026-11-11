import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { Button } from '../../../components/ui/Button.tsx';
import { FormMessage } from '../../../components/ui/FormMessage.tsx';
import { owlReact } from '../../../components/ui/owl/owlReactions.ts';
import { toUserMessage } from '../../../lib/http/index.ts';
import { PATHS } from '../../../routes/paths.ts';
import { AuthCard } from '../components/AuthCard.tsx';
import { CodeInput } from '../components/CodeInput.tsx';
import { ResendTimer } from '../components/ResendTimer.tsx';
import { TextLink } from '../components/TextLink.tsx';
import { usePendingCode } from '../hooks/usePendingCode.ts';
import { useShake } from '../hooks/useShake.ts';
import { codeSchema, type CodeValues } from '../schemas/authSchemas.ts';
import { authApi } from '../services/authApi.ts';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const { pending, markSent, clear } = usePendingCode('verify-email');
  const [cardRef, shake] = useShake<HTMLElement>();
  const {
    handleSubmit,
    control,
    resetField,
    formState: { errors },
  } = useForm<CodeValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  });

  const verify = useMutation({
    mutationFn: (values: CodeValues) =>
      authApi.verifyEmail(pending?.email ?? '', values.code),
  });
  const resend = useMutation({
    mutationFn: () => authApi.resendVerification(pending?.email ?? ''),
    onSuccess: markSent,
  });

  // Reached without an address to verify (a bookmark, a new tab).
  if (!pending) return <Navigate to={PATHS.signUp} replace />;

  const onSubmit = handleSubmit((values) => {
    if (verify.isPending) return;
    verify.mutate(values, {
      onSuccess: () => {
        owlReact('yes');
        clear();
        void navigate(PATHS.signIn, {
          replace: true,
          state: { notice: 'Email verified. You can now sign in.' },
        });
      },
      onError: () => {
        resetField('code');
        shake();
      },
    });
  }, shake);

  const requestError =
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
        {requestError ? (
          <FormMessage tone="error">{requestError}</FormMessage>
        ) : (
          <FormMessage tone="success">
            {resend.isSuccess ? 'A new code is on its way.' : null}
          </FormMessage>
        )}
        <div className="flex flex-col gap-1.5">
          <Controller
            control={control}
            name="code"
            render={({ field }) => (
              <CodeInput
                label="Verification code"
                value={field.value}
                onChange={field.onChange}
                invalid={Boolean(errors.code) || verify.isError}
                disabled={verify.isPending}
              />
            )}
          />
          {errors.code && (
            <span role="alert" className="text-[13px] text-danger">
              {errors.code.message}
            </span>
          )}
        </div>
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

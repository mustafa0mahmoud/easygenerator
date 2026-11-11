import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { Button } from '../../../components/ui/Button.tsx';
import { FormMessage } from '../../../components/ui/FormMessage.tsx';
import { LockIcon } from '../../../components/ui/icons.tsx';
import { TextField } from '../../../components/ui/TextField.tsx';
import { owlReact } from '../../../components/ui/owl/owlReactions.ts';
import { toUserMessage } from '../../../lib/http/index.ts';
import { PATHS } from '../../../routes/paths.ts';
import { AuthCard } from '../components/AuthCard.tsx';
import { CodeInput } from '../components/CodeInput.tsx';
import { PasswordRules } from '../components/PasswordRules.tsx';
import { ResendTimer } from '../components/ResendTimer.tsx';
import { TextLink } from '../components/TextLink.tsx';
import { usePendingCode } from '../hooks/usePendingCode.ts';
import { useShake } from '../hooks/useShake.ts';
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from '../schemas/authSchemas.ts';
import { authApi } from '../services/authApi.ts';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { pending, markSent, clear } = usePendingCode('reset-password');
  const [cardRef, shake] = useShake<HTMLElement>();
  const {
    register,
    handleSubmit,
    control,
    resetField,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { code: '', password: '' },
  });
  const password = useWatch({ control, name: 'password' });

  const reset = useMutation({
    mutationFn: (values: ResetPasswordValues) =>
      authApi.resetPassword(pending?.email ?? '', values.code, values.password),
  });
  const resend = useMutation({
    mutationFn: () => authApi.requestPasswordReset(pending?.email ?? ''),
    onSuccess: markSent,
  });

  // Reached without having asked for a code (a bookmark, a new tab).
  if (!pending) return <Navigate to={PATHS.forgotPassword} replace />;

  const onSubmit = handleSubmit((values) => {
    if (reset.isPending) return;
    reset.mutate(values, {
      onSuccess: () => {
        owlReact('yes');
        clear();
        void navigate(PATHS.signIn, {
          replace: true,
          state: {
            notice: 'Password changed. Sign in with your new password.',
          },
        });
      },
      onError: () => {
        resetField('code');
        shake();
      },
    });
  }, shake);

  const requestError =
    (reset.isError ? toUserMessage(reset.error) : null) ??
    (resend.isError ? toUserMessage(resend.error) : null);

  return (
    <AuthCard
      cardRef={cardRef}
      title="Choose a new password"
      lede={
        <>
          If{' '}
          <strong className="font-semibold [overflow-wrap:anywhere] text-ink">
            {pending.email}
          </strong>{' '}
          has an account, a 6-digit code is on its way. It expires in 5 minutes.
        </>
      }
      footer={<TextLink to={PATHS.signIn}>Back to sign in</TextLink>}
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
                label="Reset code"
                value={field.value}
                onChange={field.onChange}
                invalid={Boolean(errors.code) || reset.isError}
                disabled={reset.isPending}
              />
            )}
          />
          {errors.code && (
            <span role="alert" className="text-[13px] text-danger">
              {errors.code.message}
            </span>
          )}
        </div>
        <TextField
          label="New password"
          icon={<LockIcon />}
          type="password"
          autoComplete="new-password"
          placeholder="Create a new password"
          error={errors.password?.message}
          {...register('password')}
        >
          <PasswordRules password={password} />
        </TextField>
        <Button type="submit" loading={reset.isPending} className="mt-1.5">
          Change password
        </Button>
        <ResendTimer
          sentAt={pending.sentAt}
          onResend={() => {
            reset.reset();
            resend.mutate();
          }}
          isSending={resend.isPending}
        />
        <p className="m-0 text-xs text-ink-faint">
          Changing your password signs you out everywhere.
        </p>
      </form>
    </AuthCard>
  );
}

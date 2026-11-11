import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '../../../components/ui/Button.tsx';
import { FormMessage } from '../../../components/ui/FormMessage.tsx';
import { LockIcon, MailIcon } from '../../../components/ui/icons.tsx';
import { TextField } from '../../../components/ui/TextField.tsx';
import { owlReact } from '../../../components/ui/owl/useOwl.ts';
import { ApiError, toUserMessage } from '../../../lib/http/index.ts';
import { PATHS } from '../../../routes/paths.ts';
import { AuthCard } from '../components/AuthCard.tsx';
import { TextLink } from '../components/TextLink.tsx';
import { startPendingCode } from '../hooks/usePendingCode.ts';
import { useSignIn } from '../hooks/useSession.ts';
import { useShake } from '../hooks/useShake.ts';
import { signInSchema, type SignInValues } from '../schemas/authSchemas.ts';

const EMAIL_NOT_VERIFIED = 'email_not_verified';

/** A confirmation handed over by the page that sent the user here. */
function useNotice(): string | null {
  const state: unknown = useLocation().state;
  if (typeof state !== 'object' || state === null) return null;
  const notice = (state as { notice?: unknown }).notice;
  return typeof notice === 'string' ? notice : null;
}

export default function SignInPage() {
  const navigate = useNavigate();
  const notice = useNotice();
  const signIn = useSignIn();
  const [cardRef, shake] = useShake<HTMLElement>();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) });

  const onSubmit = handleSubmit((values) => {
    // A second submit while the first is running would be a duplicate request.
    if (signIn.isPending) return;
    signIn.mutate(values, {
      onSuccess: () => {
        owlReact('yes');
        void navigate(PATHS.home, { replace: true });
      },
      onError: (error) => {
        // The password was right but the address is not confirmed yet: the
        // API only says so after checking the password, so nothing leaks.
        if (error instanceof ApiError && error.code === EMAIL_NOT_VERIFIED) {
          startPendingCode('verify-email', values.email, 0);
          void navigate(PATHS.verifyEmail);
          return;
        }
        shake();
      },
    });
  }, shake);

  return (
    <AuthCard
      cardRef={cardRef}
      title="Sign in"
      lede="Good to see you again."
      footer={
        <>
          New here? <TextLink to={PATHS.signUp}>Create an account</TextLink>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {signIn.isError ? (
          <FormMessage tone="error">{toUserMessage(signIn.error)}</FormMessage>
        ) : (
          <FormMessage tone="success">{notice}</FormMessage>
        )}
        <TextField
          label="Email"
          icon={<MailIcon />}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          icon={<LockIcon />}
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          error={errors.password?.message}
          {...register('password')}
        />
        <div className="flex justify-end text-sm">
          <TextLink to={PATHS.forgotPassword}>Forgot password?</TextLink>
        </div>
        <Button type="submit" loading={signIn.isPending} className="mt-1.5">
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}

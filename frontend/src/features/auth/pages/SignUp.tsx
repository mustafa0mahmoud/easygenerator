import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { Button } from '../../../components/ui/Button.tsx';
import { FormMessage } from '../../../components/ui/FormMessage.tsx';
import { LockIcon, MailIcon, UserIcon } from '../../../components/ui/icons.tsx';
import { TextField } from '../../../components/ui/TextField.tsx';
import { owlReact } from '../../../components/ui/owl/owlReactions.ts';
import { ApiError, toUserMessage } from '../../../lib/http/index.ts';
import { PATHS } from '../../../routes/paths.ts';
import { AuthCard } from '../components/AuthCard.tsx';
import { PasswordRules } from '../components/PasswordRules.tsx';
import { TextLink } from '../components/TextLink.tsx';
import { startPendingCode } from '../hooks/usePendingCode.ts';
import { useShake } from '../hooks/useShake.ts';
import { signUpSchema, type SignUpValues } from '../schemas/authSchemas.ts';
import { authApi } from '../services/authApi.ts';

const CONFLICT = 409;

export default function SignUpPage() {
  const navigate = useNavigate();
  const [cardRef, shake] = useShake<HTMLElement>();
  const signUp = useMutation({ mutationFn: authApi.signUp });
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const password = useWatch({ control, name: 'password' });

  const onSubmit = handleSubmit((values) => {
    if (signUp.isPending) return;
    signUp.mutate(values, {
      onSuccess: () => {
        owlReact('yes');
        startPendingCode('verify-email', values.email, Date.now());
        void navigate(PATHS.verifyEmail);
      },
      onError: (error) => {
        if (error instanceof ApiError && error.status === CONFLICT) {
          setError('email', { message: error.message }, { shouldFocus: true });
        }
        shake();
      },
    });
  }, shake);

  const emailTaken =
    signUp.error instanceof ApiError && signUp.error.status === CONFLICT;

  return (
    <AuthCard
      cardRef={cardRef}
      title="Create your account"
      footer={
        <>
          Already have an account?{' '}
          <TextLink to={PATHS.signIn}>Sign in</TextLink>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {signUp.isError && !emailTaken && (
          <FormMessage tone="error">{toUserMessage(signUp.error)}</FormMessage>
        )}
        <TextField
          label="Name"
          icon={<UserIcon />}
          autoComplete="name"
          placeholder="At least 3 characters"
          error={errors.name?.message}
          {...register('name')}
        />
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
          autoComplete="new-password"
          placeholder="Create a password"
          error={errors.password?.message}
          {...register('password')}
        >
          <PasswordRules password={password} />
        </TextField>
        <Button type="submit" loading={signUp.isPending} className="mt-1.5">
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}

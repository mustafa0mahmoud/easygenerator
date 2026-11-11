import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { Button } from '../../../components/ui/Button.tsx';
import { FormMessage } from '../../../components/ui/FormMessage.tsx';
import { MailIcon } from '../../../components/ui/icons.tsx';
import { TextField } from '../../../components/ui/TextField.tsx';
import { owlReact } from '../../../components/ui/owl/useOwl.ts';
import { toUserMessage } from '../../../lib/http/index.ts';
import { PATHS } from '../../../routes/paths.ts';
import { AuthCard } from '../components/AuthCard.tsx';
import { TextLink } from '../components/TextLink.tsx';
import { startPendingCode } from '../hooks/usePendingCode.ts';
import { useShake } from '../hooks/useShake.ts';
import {
  emailOnlySchema,
  type EmailOnlyValues,
} from '../schemas/authSchemas.ts';
import { authApi } from '../services/authApi.ts';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [cardRef, shake] = useShake<HTMLElement>();
  const request = useMutation({ mutationFn: authApi.requestPasswordReset });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailOnlyValues>({ resolver: zodResolver(emailOnlySchema) });

  const onSubmit = handleSubmit(({ email }) => {
    if (request.isPending) return;
    request.mutate(email, {
      // The next page is the same whether or not the address has an account:
      // neither the API nor this page reveals which addresses are registered.
      onSuccess: () => {
        owlReact('yes');
        startPendingCode('reset-password', email, Date.now());
        void navigate(PATHS.resetPassword);
      },
      onError: shake,
    });
  }, shake);

  return (
    <AuthCard
      cardRef={cardRef}
      title="Forgot your password?"
      lede="Tell us your email and we will send a code to choose a new one."
      footer={
        <>
          Remembered it? <TextLink to={PATHS.signIn}>Back to sign in</TextLink>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {request.isError && (
          <FormMessage tone="error">{toUserMessage(request.error)}</FormMessage>
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
        <Button type="submit" loading={request.isPending} className="mt-1.5">
          Send reset code
        </Button>
      </form>
    </AuthCard>
  );
}

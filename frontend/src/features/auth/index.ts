/**
 * The auth feature's public surface. Other parts of the application import
 * from here, never from the folders inside the feature.
 *
 * Pages are exposed as loaders, not components: each one is downloaded only
 * when its route is first visited.
 */
export const authPages = {
  signIn: () => import('./pages/SignIn.tsx'),
  signUp: () => import('./pages/SignUp.tsx'),
  verifyEmail: () => import('./pages/VerifyEmail.tsx'),
  forgotPassword: () => import('./pages/ForgotPassword.tsx'),
  resetPassword: () => import('./pages/ResetPassword.tsx'),
};

export { useSession, useSignOut } from './hooks/useSession.ts';
export type { User } from './schemas/authSchemas.ts';

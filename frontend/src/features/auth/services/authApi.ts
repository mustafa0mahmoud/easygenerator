import { z } from 'zod';
import { ApiError, http } from '../../../lib/http/index.ts';
import {
  userSchema,
  type SignInValues,
  type SignUpValues,
  type User,
} from '../schemas/authSchemas.ts';

const UNAUTHORIZED = 401;

/**
 * On these endpoints a 401 is the answer to the question asked (wrong
 * password), not an expired session, so the client must not try to refresh.
 */
const PUBLIC = { refreshOn401: false } as const;

const loginResponseSchema = z.object({ user: userSchema });

export const authApi = {
  /** The signed-in user, or `null` when nobody is signed in. */
  async currentUser(signal?: AbortSignal): Promise<User | null> {
    try {
      return userSchema.parse(await http.get('/users/me', { signal }));
    } catch (error) {
      if (error instanceof ApiError && error.status === UNAUTHORIZED) {
        return null;
      }
      throw error;
    }
  },

  async signIn(values: SignInValues): Promise<User> {
    const body = await http.post('/auth/login', values, PUBLIC);
    return loginResponseSchema.parse(body).user;
  },

  signUp(values: SignUpValues): Promise<void> {
    return http.post('/auth/signup', values, PUBLIC);
  },

  verifyEmail(email: string, code: string): Promise<void> {
    return http.post('/auth/verify-email', { email, code }, PUBLIC);
  },

  resendVerification(email: string): Promise<void> {
    return http.post('/auth/resend-verification', { email }, PUBLIC);
  },

  requestPasswordReset(email: string): Promise<void> {
    return http.post('/auth/forgot-password', { email }, PUBLIC);
  },

  resetPassword(email: string, code: string, password: string): Promise<void> {
    return http.post('/auth/reset-password', { email, code, password }, PUBLIC);
  },

  /** A session that already ended is as signed out as it can be. */
  async signOut(): Promise<void> {
    try {
      await http.post('/auth/logout', undefined, PUBLIC);
    } catch (error) {
      if (error instanceof ApiError && error.status === UNAUTHORIZED) return;
      throw error;
    }
  },
};

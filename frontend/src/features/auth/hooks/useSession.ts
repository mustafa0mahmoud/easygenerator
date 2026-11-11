import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { SignInValues, User } from '../schemas/authSchemas.ts';
import { authApi } from '../services/authApi.ts';

const SESSION_KEY = ['session'] as const;

const SESSION_STALE_MS = 60_000;

/**
 * Who is signed in. The cookies are HttpOnly, so the page cannot read them:
 * the only way to know is to ask the API, and the answer is cached here as
 * the single source of truth for the whole application.
 *
 * The query's abort signal reaches `fetch`, so a request that is no longer
 * needed is cancelled and a slow old answer can never replace a newer one.
 */
export function useSession() {
  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: ({ signal }) => authApi.currentUser(signal),
    staleTime: SESSION_STALE_MS,
  });

  return {
    user: query.data ?? null,
    isLoading: query.isPending,
    isError: query.isError,
    retry: () => void query.refetch(),
  };
}

const setSession = (client: QueryClient, user: User | null) =>
  client.setQueryData(SESSION_KEY, user);

export function useSignIn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (values: SignInValues) => authApi.signIn(values),
    onSuccess: (user) => setSession(client, user),
  });
}

export function useSignOut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.signOut(),
    onSuccess: async () => {
      // An answer still in flight for the old user must not land afterwards.
      await client.cancelQueries();
      client.clear();
      setSession(client, null);
    },
  });
}

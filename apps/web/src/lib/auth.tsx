import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Role } from '@bnhs/core';
import { api, getToken, onUnauthorized, post, setToken } from './api';
import type { SessionData, User } from './types';

interface AuthApi {
  session: SessionData | undefined;
  user: User | undefined;
  loading: boolean;
  signedIn: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
  adoptToken: (token: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  // token presence must be state so that signing in re-renders the whole app
  const [hasToken, setHasToken] = useState(() => Boolean(getToken()));

  const q = useQuery({
    queryKey: ['session'],
    queryFn: () => api<SessionData>('/session'),
    enabled: hasToken,
    staleTime: 60_000,
    retry: false,
  });

  const signOut = useCallback(() => {
    setToken(null);
    qc.clear();
    // a full reload is the simplest way to drop every cached screen and in-memory form
    window.location.assign('/');
  }, [qc]);

  useEffect(() => onUnauthorized(() => signOut()), [signOut]);

  const adoptToken = useCallback(
    async (token: string) => {
      setToken(token);
      setHasToken(true);
      await qc.invalidateQueries({ queryKey: ['session'] });
    },
    [qc],
  );

  const signIn = useCallback(
    async (username: string, password: string) => {
      const r = await post<{ token: string }>('/auth/login', { username, password });
      qc.clear();
      await adoptToken(r.token);
    },
    [adoptToken, qc],
  );

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['session'] });
  }, [qc]);

  const value = useMemo<AuthApi>(
    () => ({
      session: q.data,
      user: q.data?.user,
      loading: hasToken && q.isPending,
      signedIn: hasToken && Boolean(q.data),
      signIn,
      signOut,
      adoptToken,
      refresh,
    }),
    [q.data, q.isPending, hasToken, signIn, signOut, adoptToken, refresh],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthApi {
  const v = useContext(AuthCtx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** The signed-in session. Only call below the sign-in gate. */
export function useSession(): SessionData {
  const { session } = useAuth();
  if (!session) throw new Error('useSession before sign-in');
  return session;
}

export function useRole(): Role {
  return useSession().user.role;
}

export const isOfficeRole = (r: Role): boolean => r === 'ADMIN' || r === 'REGISTRAR';

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import {
  ACTIVE_WORKSPACE_KEY,
  AuthClient,
  type SessionUser,
  type SessionWorkspace,
} from '@/lib/auth-client';

interface MeResponse {
  user: SessionUser;
  workspaces: SessionWorkspace[];
}

interface AuthContextValue {
  /** Undefined while the first refresh is still in flight. */
  user: SessionUser | null | undefined;
  workspaces: SessionWorkspace[];
  activeWorkspace: SessionWorkspace | null;
  setActiveWorkspace: (id: string) => void;
  signIn: (path: '/auth/login' | '/auth/register', body: unknown) => Promise<void>;
  signOut: () => Promise<void>;
  /** Authenticated request against the API, scoped to the active workspace. */
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  reload: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = React.useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return value;
}

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const router = useRouter();
  const client = React.useMemo(() => new AuthClient(), []);

  const [user, setUser] = React.useState<SessionUser | null | undefined>(undefined);
  const [workspaces, setWorkspaces] = React.useState<SessionWorkspace[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const loadMe = React.useCallback(async (): Promise<void> => {
    const me = await client.request<MeResponse>('/me');
    setUser(me.user);
    setWorkspaces(me.workspaces);

    setActiveId((current) => {
      const stored = current ?? readStoredWorkspaceId();
      const known = me.workspaces.some((workspace) => workspace.id === stored);
      // A remembered workspace the user has since been removed from falls back
      // to their first one rather than sending X-Workspace-Id the API will 403.
      return known && stored ? stored : (me.workspaces[0]?.id ?? null);
    });
  }, [client]);

  // On boot the access token is gone (it only ever lived in memory), so the
  // refresh cookie is the only thing that can say whether there is a session.
  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      const token = await client.refresh();

      if (cancelled) {
        return;
      }

      if (!token) {
        setUser(null);
        return;
      }

      try {
        await loadMe();
      } catch {
        setUser(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, loadMe]);

  React.useEffect(() => {
    if (activeId) {
      window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, activeId);
    }
  }, [activeId]);

  const signIn = React.useCallback(
    async (path: '/auth/login' | '/auth/register', body: unknown): Promise<void> => {
      const result = await client.post<{ user: SessionUser; access_token: string }>(path, body);
      client.setAccessToken(result.access_token);
      setUser(result.user);
      await loadMe();
    },
    [client, loadMe],
  );

  const signOut = React.useCallback(async (): Promise<void> => {
    await client.post('/auth/logout', {}).catch(() => undefined);
    client.setAccessToken(null);
    setUser(null);
    setWorkspaces([]);
    setActiveId(null);
    window.localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
    router.push('/login');
  }, [client, router]);

  /**
   * Every authenticated call goes through here so that a session that has
   * really expired, a 401 that survived the retry inside AuthClient, lands the
   * user on /login instead of leaving a half rendered page.
   */
  const request = React.useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      try {
        return await client.request<T>(path, { ...init, workspaceId: activeId ?? undefined });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setUser(null);
          router.push('/login');
        }
        throw error;
      }
    },
    [client, activeId, router],
  );

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      workspaces,
      activeWorkspace: workspaces.find((workspace) => workspace.id === activeId) ?? null,
      setActiveWorkspace: setActiveId,
      signIn,
      signOut,
      request,
      reload: loadMe,
    }),
    [user, workspaces, activeId, signIn, signOut, request, loadMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function readStoredWorkspaceId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

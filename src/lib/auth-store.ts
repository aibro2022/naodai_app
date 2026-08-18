import { useCallback, useEffect, useState } from 'react';
import type { Account, AuthSession, RegisterPayload } from '@/ipc';

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await window.api.getConfig();
        if (config.auth?.token) {
          try {
            const profile = await window.api.getProfile();
            if (!cancelled) {
              setSession({ ...config.auth, account: profile });
            }
          } catch {
            await window.api.updateConfig({ auth: undefined });
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const next = await window.api.login(username, password);
    setSession(next);
  }, []);

  const logout = useCallback(async () => {
    setSession(null);
    await window.api.logout();
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    await window.api.register(payload);
  }, []);

  return {
    user: session?.account ?? null,
    loading,
    login,
    logout,
    register,
  };
}

export type { Account };
/**
 * Сессия пользователя. Access-токен держится в памяти модуля `http`,
 * при монтировании приложения делается «тихий» `/auth/refresh`:
 * после перезагрузки страницы вкладка восстанавливает сессию из httpOnly-cookie.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api';
import type { AuthUser } from '@/lib/api-types';
import { clearSession, refreshAccessToken, setSessionLostHandler } from '@/lib/http';

export interface AuthContextValue {
  user: AuthUser | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Перечитывает профиль — например, после подтверждения e-mail. */
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialUser = null,
  skipBootstrap = false,
}: {
  children: ReactNode;
  /** Только для тестов: подставить готовую сессию. */
  initialUser?: AuthUser | null;
  skipBootstrap?: boolean;
}): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [status, setStatus] = useState<AuthContextValue['status']>(
    skipBootstrap ? (initialUser ? 'authenticated' : 'anonymous') : 'loading',
  );
  const queryClient = useQueryClient();

  /**
   * Кеш TanStack Query переживает смену пользователя, если его не сбросить:
   * следующий вошедший увидит заявки предыдущего, пока не истечёт staleTime.
   * Поэтому кеш чистится на каждой границе сессии — вход, выход и потеря сессии.
   */
  const dropSession = useCallback(() => {
    clearSession();
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setSessionLostHandler(() => {
      setUser(null);
      setStatus('anonymous');
      queryClient.clear();
    });
    return () => setSessionLostHandler(null);
  }, [queryClient]);

  useEffect(() => {
    if (skipBootstrap) return;
    let cancelled = false;

    void (async () => {
      const token = await refreshAccessToken();
      if (cancelled) return;
      if (!token) {
        setStatus('anonymous');
        return;
      }
      try {
        const me = await authApi.me();
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      } catch {
        if (!cancelled) setStatus('anonymous');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [skipBootstrap]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authApi.login(email, password);
      // Чужих данных в кеше на момент входа быть не должно ни при каком
      // сценарии выхода — в том числе после закрытия сессии сервером.
      queryClient.clear();
      setUser(result.user);
      setStatus('authenticated');
      return result.user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* сессию всё равно закрываем локально */
    }
    dropSession();
  }, [dropSession]);

  const reload = useCallback(async () => {
    try {
      const me = await authApi.me();
      setUser(me);
      setStatus('authenticated');
    } catch {
      dropSession();
    }
  }, [dropSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, logout, reload }),
    [user, status, login, logout, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** Сотрудник — сметчик или админ (MVP §3). */
export function isStaff(user: AuthUser | null): boolean {
  return user?.role === 'ESTIMATOR' || user?.role === 'ADMIN';
}

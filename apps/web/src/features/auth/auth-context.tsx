/**
 * Сессия пользователя. Access-токен держится в памяти модуля `http`,
 * при монтировании приложения делается «тихий» `/auth/refresh`:
 * после перезагрузки страницы вкладка восстанавливает сессию из httpOnly-cookie.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  const hadSession = useRef(initialUser !== null);

  /**
   * Закрывает сессию локально. Кеш здесь **не** чистится: очистка синхронно,
   * до перерисовки, оставляла бы наблюдателей `useQuery` включёнными, и первая
   * же перерисовка экрана с чужими данными заводила бы запрос заново — кеш
   * наполнялся бы обратно. Чистит эффект ниже, когда дерево уже анонимно.
   */
  const dropSession = useCallback(() => {
    clearSession();
    setUser(null);
    setStatus('anonymous');
  }, []);

  /**
   * Вторая линия обороны: сброс кеша на переходе «был пользователь → нет».
   * Эффект выполняется после коммита, то есть когда защищённые экраны уже
   * размонтированы, а уцелевшие запросы к данным пользователя выключены своим
   * `enabled` (первая линия — см. `enabled` в CabinetPage и админских экранах).
   * Поэтому очистка не может спровоцировать перезапрос ни при каком порядке
   * планирования обновлений.
   */
  useEffect(() => {
    if (user) {
      hadSession.current = true;
      return;
    }
    if (!hadSession.current) return;
    hadSession.current = false;
    queryClient.clear();
  }, [user, queryClient]);

  useEffect(() => {
    setSessionLostHandler(() => {
      clearSession();
      setUser(null);
      setStatus('anonymous');
    });
    return () => setSessionLostHandler(null);
  }, []);

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
      // На этот момент пользователя ещё нет, значит все запросы к его данным
      // выключены — очистка безопасна и не может быть тут же отменена ответом
      // «старого» запроса.
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

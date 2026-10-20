import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, getToken, onSessionExpired, setToken } from './api';
import { authApi } from './endpoints';
import type { User } from './types';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  /** True when the teacher-created account must set a password before first use. */
  mustChangePassword: boolean;
  /** Human-readable notice (session expiry, forced sign-out). */
  notice: string | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearNotice: () => void;
  setMustChangePassword: (value: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_STORAGE_KEY = 'ofijan.student.user.v1';

function readCachedUser(): User | null {
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function cacheUser(user: User | null): void {
  try {
    if (user) window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    /* storage unavailable — profile simply refetches each load */
  }
}

/**
 * Role-based routing support.
 * The portal now supports student, teacher, and admin roles.
 * Each role has its own dashboard and routing tree.
 */
function getRoleRoute(user: Pick<User, 'role_slug'> | null): string {
  switch (user?.role_slug) {
    case 'admin':
      return '/admin';
    case 'teacher':
      return '/teacher';
    case 'student':
      return '/dashboard';
    default:
      return '/login';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readCachedUser());
  const [status, setStatus] = useState<AuthStatus>(() =>
    getToken() ? 'loading' : 'anonymous',
  );
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(() => {
    try {
      const raw = window.localStorage.getItem(USER_STORAGE_KEY);
      if (!raw) return false;
      const cached = JSON.parse(raw) as User;
      return Boolean(cached?.must_change_password);
    } catch {
      return false;
    }
  });
  const [notice, setNotice] = useState<string | null>(null);

  const applySignOut = useCallback((message?: string | null) => {
    setToken(null);
    cacheUser(null);
    setUser(null);
    setMustChangePassword(false);
    setStatus('anonymous');
    if (message) setNotice(message);
  }, []);

  // Bootstrap: validate the stored token against the authoritative profile.
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        const profile = await authApi.profile();
        if (cancelled) return;
        cacheUser(profile);
        setUser(profile);
        setMustChangePassword(Boolean(profile.must_change_password));
        setStatus('authenticated');
      } catch (error) {
        if (cancelled) return;
        if (error && typeof error === 'object' && 'status' in error && error.status === 401) {
          applySignOut('Your session has expired. Please sign in again.');
        } else if (error && typeof error === 'object' && 'kind' in error && error.kind === 'network') {
          // Offline with a stored session: keep the cached identity, the API
          // layer will surface connectivity errors where they happen.
          const cached = readCachedUser();
          setUser(cached);
          setMustChangePassword(Boolean(cached?.must_change_password));
          setStatus(cached ? 'authenticated' : 'anonymous');
        } else {
          applySignOut('Your session could not be validated. Please sign in again.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySignOut]);

  // Any 401 from an authenticated call drops us back to the login screen.
  useEffect(
    () =>
      onSessionExpired(() => {
        applySignOut('Your session has expired. Please sign in again.');
      }),
    [applySignOut],
  );

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const result = await authApi.login(email, password);
    setToken(result.token);
    const profile = await authApi.profile();
    cacheUser(profile);
    setUser(profile);
    setMustChangePassword(Boolean(profile.must_change_password));
    setStatus('authenticated');
    setNotice(null);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    applySignOut(null);
  }, [applySignOut]);

  const refreshProfile = useCallback(async () => {
    const profile = await authApi.profile();
    cacheUser(profile);
    setUser(profile);
    setMustChangePassword(Boolean(profile.must_change_password));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      mustChangePassword,
      notice,
      login,
      logout,
      refreshProfile,
      clearNotice: () => setNotice(null),
      setMustChangePassword,
    }),
    [user, status, mustChangePassword, notice, login, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

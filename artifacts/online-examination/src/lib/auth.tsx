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
  /** Human-readable notice (session expiry, forced sign-out). */
  notice: string | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearNotice: () => void;
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
 * The examination portal is a student-only surface. The backend enforces the
 * same rule on POST /v1/login, but every session accepted here is re-checked
 * so a token issued elsewhere can never open the portal.
 */
function isStudent(user: Pick<User, 'role_slug'> | null): boolean {
  return user?.role_slug === 'student';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readCachedUser());
  const [status, setStatus] = useState<AuthStatus>(() =>
    getToken() ? 'loading' : 'anonymous',
  );
  const [notice, setNotice] = useState<string | null>(null);

  const applySignOut = useCallback((message?: string | null) => {
    setToken(null);
    cacheUser(null);
    setUser(null);
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
        if (!isStudent(profile)) {
          applySignOut('The online examination portal is available to student accounts only.');
          return;
        }
        cacheUser(profile);
        setUser(profile);
        setStatus('authenticated');
      } catch (error) {
        if (cancelled) return;
        if (error && typeof error === 'object' && 'status' in error && error.status === 401) {
          applySignOut('Your session has expired. Please sign in again.');
        } else if (error && typeof error === 'object' && 'kind' in error && error.kind === 'network') {
          // Offline with a stored session: keep the cached identity, the API
          // layer will surface connectivity errors where they happen.
          const cached = readCachedUser();
          if (!isStudent(cached)) {
            applySignOut('The online examination portal is available to student accounts only.');
            return;
          }
          setUser(cached);
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
    if (!isStudent(profile)) {
      try {
        await authApi.logout(); // revoke the token server-side
      } catch {
        /* token cleanup is best effort — the local session is dropped below */
      }
      setToken(null);
      throw new ApiError(
        'The online examination portal is available to student accounts only.',
        403,
        'http',
      );
    }
    cacheUser(profile);
    setUser(profile);
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
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      notice,
      login,
      logout,
      refreshProfile,
      clearNotice: () => setNotice(null),
    }),
    [user, status, notice, login, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

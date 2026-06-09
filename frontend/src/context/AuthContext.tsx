import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  clearPermissionCatalogCache,
  fetchMe,
  loginRequest,
  logoutRequest,
  refreshRequest,
  type MeResponse,
} from "../api/authApi";
import { AUTH_SESSION_EXPIRED_EVENT } from "../auth/authEvents";
import { setLoginNotice } from "../auth/authSessionPrefs";
import { permissionGranted } from "../auth/permissionEffective";
import { isSuperRole } from "../auth/isSuperRole";
import { clearStoredTokens, getStoredAccessToken, getStoredRefreshToken, setStoredTokens } from "../auth/tokenStorage";

type AuthContextValue = {
  user: MeResponse | null;
  loading: boolean;
  /** True when bootstrap finished, session user is loaded, and an access token is present — safe for authenticated API calls. */
  sessionReady: boolean;
  login: (login: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  hasPermission: (key: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    const access = getStoredAccessToken();
    const refresh = getStoredRefreshToken();
    if (!access) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await fetchMe();
      if (!me.is_active) {
        clearStoredTokens();
        setUser(null);
        setLoginNotice("account_inactive");
        return;
      }
      setUser(me);
    } catch {
      if (refresh) {
        try {
          const t = await refreshRequest(refresh);
          setStoredTokens(t.access_token, t.refresh_token);
          const me = await fetchMe();
          if (!me.is_active) {
            clearStoredTokens();
            setUser(null);
            setLoginNotice("account_inactive");
            return;
          }
          setUser(me);
        } catch {
          clearStoredTokens();
          setUser(null);
          setLoginNotice("session_expired");
        }
      } else {
        clearStoredTokens();
        setUser(null);
        setLoginNotice("session_expired");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const onExpired = () => {
      clearStoredTokens();
      setUser(null);
      setLoginNotice("session_expired");
    };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (loginStr: string, password: string, rememberMe = true) => {
    clearPermissionCatalogCache();
    const t = await loginRequest(loginStr, password);
    setStoredTokens(t.access_token, t.refresh_token, rememberMe);
    const me = await fetchMe();
    if (!me.is_active) {
      clearStoredTokens();
      setLoginNotice("account_inactive");
      throw new Error("Konto jest nieaktywne.");
    }
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    const refresh = getStoredRefreshToken();
    try {
      if (refresh) await logoutRequest(refresh);
    } finally {
      clearPermissionCatalogCache();
      clearStoredTokens();
      setUser(null);
      setLoginNotice("logged_out");
    }
  }, []);

  const hasPermission = useCallback(
    (key: string) => {
      if (!user) return false;
      if (isSuperRole(user.role)) return true;
      return permissionGranted(user.permissions ?? [], key);
    },
    [user],
  );

  const sessionReady = !loading && user !== null && Boolean(getStoredAccessToken());

  const value = useMemo(
    () => ({
      user,
      loading,
      sessionReady,
      login,
      logout,
      refreshSession,
      hasPermission,
    }),
    [user, loading, sessionReady, login, logout, refreshSession, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

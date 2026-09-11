/**
 * useAuth — session state hook backed by /api/auth/me, shared via AuthContext.
 *
 * Boot sequence: `getAuthConfig()` establishes the backend-owned auth mode,
 * then `me()` hydrates the user AND their daily rate-limit counter (MISSION
 * §10 invariant #1 + issue #52). The single `status` union is the
 * discriminated bootstrap state (OpenSpec google-drive-managed-workspace):
 * configuration, provider authentication, session establishment, and
 * downstream Drive bootstrap never live in parallel booleans.
 *
 * `refresh()` is exposed so the chat area can call it after each successful
 * send — the counter needs to decrement by one per message. Because the
 * state lives in context, Sidebar and ChatArea see the same snapshot.
 */

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { getDriveStatus, startDriveOAuth } from '../lib/api';
import {
  type AuthConfig,
  AuthError,
  type AuthMeResponse,
  login as apiLogin,
  loginWithGoogle as apiLoginWithGoogle,
  logout as apiLogout,
  signup as apiSignup,
  getAuthConfig,
  me,
} from '../lib/authApi';

export type BootstrapStatus =
  | 'loading-config'
  | 'unauthenticated-local'
  | 'unauthenticated-google'
  | 'authenticating-google'
  | 'establishing-session'
  | 'checking-drive'
  | 'authorizing-drive'
  | 'preparing-workspace'
  | 'ready'
  | 'ready-without-drive'
  | 'error';

export function isAuthenticatedStatus(status: BootstrapStatus): boolean {
  return status === 'ready' || status === 'ready-without-drive';
}

export function isUnauthenticatedStatus(status: BootstrapStatus): boolean {
  return status === 'unauthenticated-local' || status === 'unauthenticated-google';
}

const HANDLED_CALLBACK_RESULTS = [
  'connected',
  'consent_denied',
  'account_mismatch',
  'provider_error',
];

function callbackResult(): string | null {
  const result = new URLSearchParams(window.location.search).get('result');
  return result && HANDLED_CALLBACK_RESULTS.includes(result) ? result : null;
}

export interface UseAuthResult {
  status: BootstrapStatus;
  user: AuthMeResponse | null;
  error: string | null;
  authConfig: AuthConfig | null;
  signup: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  connectDrive: () => Promise<void>;
}

const AuthContext = createContext<UseAuthResult | null>(null);

function anonStatusFor(mode: AuthConfig['mode'] | null | undefined): BootstrapStatus {
  return mode === 'google' ? 'unauthenticated-google' : 'unauthenticated-local';
}

function useAuthState(): UseAuthResult {
  const [user, setUser] = useState<AuthMeResponse | null>(null);
  const [status, setStatus] = useState<BootstrapStatus>('loading-config');
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Post-hydration Drive bootstrap. Runs only after authoritative
  // /api/auth/me success. A handled callback result (denial, mismatch,
  // provider error) never re-triggers auto-onboarding; a connected result
  // verifies status before ready. The OAuth handoff is always the backend
  // POST contract followed by `window.location.assign` exactly once.
  async function driveBootstrap(cfg: AuthConfig, isCancelled: () => boolean): Promise<void> {
    const result = callbackResult();
    if (result !== null && result !== 'connected') {
      setStatus('ready-without-drive');
      return;
    }
    if (!cfg.drive_enabled) {
      setStatus('ready');
      return;
    }
    setStatus(result === 'connected' ? 'preparing-workspace' : 'checking-drive');
    try {
      const drive = await getDriveStatus();
      if (isCancelled()) return;
      if (drive.status === 'connected') {
        setStatus('ready');
        return;
      }
      if (drive.status === 'disconnected' && cfg.drive_auto_onboard && result === null) {
        setStatus('authorizing-drive');
        try {
          const { authorization_url } = await startDriveOAuth();
          if (isCancelled()) return;
          window.location.assign(authorization_url);
        } catch (e) {
          if (isCancelled()) return;
          setError(e instanceof Error ? e.message : 'Google Drive no está disponible.');
          setStatus('ready-without-drive');
        }
        return;
      }
      setStatus('ready-without-drive');
    } catch {
      if (isCancelled()) return;
      setStatus('ready-without-drive');
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const cfg = await getAuthConfig();
        if (cancelled) return;
        setAuthConfig(cfg);
        try {
          const u = await me();
          if (cancelled) return;
          setUser(u);
          await driveBootstrap(cfg, () => cancelled);
        } catch (e) {
          if (cancelled) return;
          setUser(null);
          setStatus(anonStatusFor(cfg.mode));
          if (e instanceof AuthError && e.status !== 401) {
            setError(e.message);
          }
        }
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setError(e instanceof Error ? e.message : 'No se pudo cargar la configuración.');
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const u = await me();
      setUser(u);
      setStatus('ready');
    } catch (e) {
      setUser(null);
      setStatus(anonStatusFor(authConfig?.mode));
      if (e instanceof AuthError && e.status !== 401) {
        setError(e.message);
      }
    }
  }, [authConfig]);

  const doLogin = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        await apiLogin(email, password);
        const u = await me();
        setUser(u);
        const cfg = authConfig;
        if (!cfg) {
          setStatus('ready');
          return;
        }
        await driveBootstrap(cfg, () => false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Login failed';
        setError(msg);
        throw e;
      }
    },
    [authConfig],
  );

  const doLoginWithGoogle = useCallback(
    async (credential: string) => {
      setError(null);
      setStatus('authenticating-google');
      try {
        await apiLoginWithGoogle(credential);
        setStatus('establishing-session');
        const u = await me();
        setUser(u);
        const cfg = authConfig;
        if (!cfg) {
          setStatus('ready');
          return;
        }
        await driveBootstrap(cfg, () => false);
      } catch (e) {
        setUser(null);
        setStatus(anonStatusFor(authConfig?.mode));
        const msg = e instanceof Error ? e.message : 'Google login failed';
        setError(msg);
        throw e;
      }
    },
    [authConfig],
  );

  const doSignup = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        await apiSignup(email, password);
        await refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Signup failed';
        setError(msg);
        throw e;
      }
    },
    [refresh],
  );

  const doLogout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
      setStatus(anonStatusFor(authConfig?.mode));
    }
  }, [authConfig]);

  const connectDrive = useCallback(async () => {
    setError(null);
    setStatus('authorizing-drive');
    try {
      const { authorization_url } = await startDriveOAuth();
      window.location.assign(authorization_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google Drive no está disponible.');
      setStatus('ready-without-drive');
      throw e;
    }
  }, []);

  return useMemo(
    () => ({
      status,
      user,
      error,
      authConfig,
      signup: doSignup,
      login: doLogin,
      loginWithGoogle: doLoginWithGoogle,
      logout: doLogout,
      refresh,
      connectDrive,
    }),
    [
      status,
      user,
      error,
      authConfig,
      doSignup,
      doLogin,
      doLoginWithGoogle,
      doLogout,
      refresh,
      connectDrive,
    ],
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): UseAuthResult {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

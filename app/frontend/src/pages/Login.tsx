import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, type Location, useLocation, useNavigate } from 'react-router-dom';
import { BrandingHeader } from '../components/BrandingHeader';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../hooks/useAuth';
import { AuthError } from '../lib/authApi';

interface LocationStateWithFrom {
  from?: string;
}

interface GisCredentialResponse {
  credential?: string;
}

interface GisAccountsId {
  initialize: (config: Record<string, unknown>) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
}

function gisClient(): GisAccountsId | null {
  const g = (window as { google?: { accounts?: { id?: GisAccountsId } } }).google;
  return g?.accounts?.id ?? null;
}

function loadGisScript(): Promise<void> {
  if (gisClient()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Sign-In no está disponible.'));
    document.head.appendChild(script);
  });
}

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { status, error, authConfig, login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as Location & { state: LocationStateWithFrom | null };
  const returnTo = location.state?.from ?? '/';
  const gisContainerRef = useRef<HTMLDivElement | null>(null);
  const gisInitializedRef = useRef(false);

  async function handleGoogleCredential(resp: GisCredentialResponse) {
    const credential = resp?.credential;
    if (!credential) return;
    setFormError(null);
    try {
      await loginWithGoogle(credential);
    } catch (err) {
      const msg = err instanceof AuthError ? err.message : 'No se pudo iniciar sesión con Google.';
      setFormError(msg);
    }
  }

  // Official GIS popup callback flow: no One Tap prompt(), no auto-select,
  // no FedCM button mode, no login_uri redirect flow.
  useEffect(() => {
    if (status !== 'unauthenticated-google' || gisInitializedRef.current) return;
    const clientId = authConfig?.google_client_id;
    const container = gisContainerRef.current;
    if (!clientId || !container) return;
    gisInitializedRef.current = true;
    let cancelled = false;
    void loadGisScript()
      .then(() => {
        if (cancelled) return;
        const gis = gisClient();
        if (!gis) return;
        gis.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          auto_select: false,
          use_fedcm_for_button: false,
          button_auto_select: false,
          callback: (resp: GisCredentialResponse) => {
            void handleGoogleCredential(resp);
          },
        });
        const buttonWidth = Math.min(container.clientWidth || 400, 400);
        gis.renderButton(container, {
          theme: 'outline',
          size: 'large',
          width: String(buttonWidth),
        });
      })
      .catch(() => {
        setFormError('No se pudo cargar Google Sign-In.');
      });
    return () => {
      cancelled = true;
    };
  }, [status, authConfig]);

  useEffect(() => {
    if (status === 'ready' || status === 'ready-without-drive') {
      navigate(returnTo, { replace: true });
    }
  }, [status, navigate, returnTo]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(returnTo, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo iniciar sesión.';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <BrandingHeader />
      {status === 'loading-config' && (
        <div
          className="auth-card flex flex-col items-center gap-3"
          role="status"
          aria-label="Preparando acceso"
        >
          <Spinner />
          <p>Preparando acceso…</p>
        </div>
      )}
      {status === 'unauthenticated-google' && (
        <div className="auth-card flex flex-col items-center gap-4">
          <h1 className="text-xl font-semibold">Iniciar sesión</h1>
          {formError && (
            <div className="text-sm text-[var(--danger)] w-full text-center" role="alert">
              {formError}
            </div>
          )}
          <div ref={gisContainerRef} className="w-full" data-testid="google-signin-button" />
        </div>
      )}
      {status === 'authenticating-google' && (
        <div className="auth-card flex flex-col items-center gap-3" role="status">
          <Spinner />
          <p className="text-sm text-[var(--text-secondary)]">Iniciando sesión…</p>
        </div>
      )}
      {(status === 'establishing-session' ||
        status === 'checking-drive' ||
        status === 'authorizing-drive' ||
        status === 'preparing-workspace' ||
        status === 'ready') && (
        <div className="auth-card flex flex-col items-center gap-3" role="status">
          <Spinner />
          <p className="text-sm text-[var(--text-secondary)]">Cuenta verificada</p>
        </div>
      )}
      {status === 'error' && (
        <div className="auth-card">
          <div className="text-sm text-[var(--danger)]" role="alert">
            {error ?? 'No se pudo cargar la configuración.'}
          </div>
          <button type="button" className="auth-retry" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      )}
      {status === 'unauthenticated-local' && (
        <form onSubmit={handleSubmit} aria-busy={submitting} className="auth-card space-y-4">
          <h1 className="text-xl font-semibold">Iniciar sesión</h1>
          <label className="block text-sm">
            <span className="text-[var(--text-secondary)]">Correo electrónico</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="auth-field"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--text-secondary)]">Contraseña</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-field"
            />
          </label>
          {formError && (
            <div className="text-sm text-[var(--danger)]" role="alert">
              {formError}
            </div>
          )}
          <button type="submit" disabled={submitting} className="auth-submit">
            {submitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
          </button>
          <div className="text-sm text-[var(--text-secondary)] text-center">
            ¿Necesitas una cuenta?{' '}
            <Link to="/signup" className="text-[var(--accent)] hover:underline">
              Regístrate
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

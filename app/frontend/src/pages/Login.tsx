import { type FormEvent, useState } from 'react';
import { Link, type Location, useLocation, useNavigate } from 'react-router-dom';
import { BrandingHeader } from '../components/BrandingHeader';
import { useAuth } from '../hooks/useAuth';

interface LocationStateWithFrom {
  from?: string;
}

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as Location & { state: LocationStateWithFrom | null };
  const returnTo = location.state?.from ?? '/';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(returnTo, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)] text-[var(--text-primary)] p-4 gap-8">
      <BrandingHeader />
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-[var(--surface-1)] border border-[var(--border)] rounded-lg p-6 space-y-4"
      >
        <h1 className="text-xl font-semibold">Iniciar sesión</h1>
        <label className="block text-sm">
          <span className="text-[var(--text-secondary)]">Correo electrónico</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
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
            className="mt-1 w-full px-3 py-2 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </label>
        {formError && (
          <div className="text-sm text-[var(--danger)]" role="alert">
            {formError}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2 rounded bg-[var(--accent)] text-white font-medium disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
        >
          {submitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
        </button>
        <div className="text-sm text-[var(--text-secondary)] text-center">
          ¿Necesitas una cuenta?{' '}
          <Link to="/signup" className="text-[var(--accent)] hover:underline">
            Regístrate
          </Link>
        </div>
      </form>
    </div>
  );
}

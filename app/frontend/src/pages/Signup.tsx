import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandingHeader } from '../components/BrandingHeader';
import { useAuth } from '../hooks/useAuth';
import { AuthError } from '../lib/authApi';

type FormErrorKind = 'error' | 'warning';

export function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<{ kind: FormErrorKind; msg: string } | null>(null);

  const { signup } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (password.length < 8) {
      setFormError({ kind: 'error', msg: 'La contraseña debe tener al menos 8 caracteres' });
      return;
    }
    setSubmitting(true);
    try {
      await signup(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      // 429 from signup rate-limit is a soft "try again later" — render it as
      // a yellow warning rather than a red error so real users aren't scared.
      if (err instanceof AuthError && err.status === 429 && err.rateLimitScope) {
        setFormError({ kind: 'warning', msg: err.message });
      } else {
        const msg = err instanceof Error ? err.message : 'Signup failed';
        setFormError({ kind: 'error', msg });
      }
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
        <h1 className="text-xl font-semibold">Crear cuenta</h1>
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
          <span className="text-[var(--text-secondary)]">Contraseña (8+ caracteres)</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </label>
        {formError && formError.kind === 'error' && (
          <div className="text-sm text-[var(--danger)]" role="alert">
            {formError.msg}
          </div>
        )}
        {formError && formError.kind === 'warning' && (
          <div
            className="text-sm rounded px-3 py-2 border"
            role="alert"
            style={{
              color: 'var(--warning)',
              backgroundColor: 'var(--warning-bg)',
              borderColor: 'var(--warning-border)',
            }}
          >
            {formError.msg}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 w-full rounded bg-[var(--accent)] py-2 font-medium text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {submitting ? 'Creando cuenta…' : 'Registrarse'}
        </button>
        <div className="text-sm text-[var(--text-secondary)] text-center">
          ¿Ya tienes una cuenta?{' '}
          <Link to="/login" className="text-[var(--accent)] hover:underline">
            Iniciar sesión
          </Link>
        </div>
      </form>
    </div>
  );
}

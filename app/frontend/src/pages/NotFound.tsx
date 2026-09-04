import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--text-primary)] p-4">
      <div className="w-full max-w-sm bg-[var(--surface-1)] border border-[var(--border)] rounded-lg p-6 space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Página no encontrada</h1>
        <p className="text-sm text-[var(--text-secondary)]">La página que buscas no existe.</p>
        <Link
          to="/"
          className="inline-block py-2 px-4 rounded bg-[var(--accent)] text-white font-medium no-underline"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}

/**
 * DriveBootstrapBanner — minimal `ready-without-drive` surface.
 *
 * Rendered inside AppShell when the Dental session is active but Drive is
 * disconnected and onboarding did not start automatically (or consent was
 * denied, the account mismatched, the provider failed, or the handoff
 * errored). One dominant `Conectar Drive` action re-runs the explicit
 * backend-built OAuth handoff; the button collapses into the repository
 * Spinner with `Conectando…` while the start request is in flight.
 */

import { useAuth } from '../hooks/useAuth';
import { Spinner } from './Spinner';

export function DriveBootstrapBanner() {
  const { status, connectDrive } = useAuth();
  if (status !== 'ready-without-drive' && status !== 'authorizing-drive') return null;
  const connecting = status === 'authorizing-drive';

  return (
    <div
      role="status"
      className="drive-bootstrap-banner flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-3"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          Google Drive no está conectado
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          Puedes continuar utilizando Dental AI Assistant. Conecta Drive cuando quieras trabajar con
          documentos.
        </p>
      </div>
      <button
        type="button"
        disabled={connecting}
        onClick={() => {
          void connectDrive().catch(() => undefined);
        }}
        className="min-h-11 rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {connecting ? (
          <span className="flex items-center gap-2">
            <Spinner />
            Conectando…
          </span>
        ) : (
          'Conectar Drive'
        )}
      </button>
    </div>
  );
}

import { type ReactNode, useState } from 'react';
import type { DriveSourceFile } from '../../lib/api';
import { DriveSourceList } from './DriveSourceList';
import type { DrivePatientContext } from './editors/types';

export function DriveWorkspaceHome({
  files,
  loading,
  canPick,
  picking,
  onPick,
  onOpen,
  onMore,
  patient,
  children,
}: {
  files: DriveSourceFile[];
  loading: boolean;
  canPick: boolean;
  picking: boolean;
  onPick: () => void;
  onOpen: (file: DriveSourceFile) => void;
  onMore?: () => void;
  patient: DrivePatientContext | null;
  children: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const filtered = files.filter((file) =>
    file.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <input
        type="search"
        className="drive-search"
        aria-label="Buscar archivos"
        placeholder="Buscar archivos en Drive..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <button
        type="button"
        className="drive-btn drive-btn-primary my-3"
        disabled={!canPick || picking}
        onClick={onPick}
      >
        {picking ? 'Abriendo…' : 'Abrir desde Drive'}
      </button>
      {!canPick && <p>Selecciona un paciente para abrir el selector de Drive.</p>}
      <h2>Fuentes</h2>
      <DriveSourceList files={filtered} loading={loading} onOpen={onOpen} />
      {!loading && !filtered.length && (
        <p>
          {query
            ? 'Sin coincidencias en los archivos cargados.'
            : 'No hay archivos disponibles todavía. Abre un archivo desde Google Drive para incorporarlo a tu flujo de trabajo.'}
        </p>
      )}
      {onMore && (
        <button
          type="button"
          className="drive-btn drive-btn-secondary"
          onClick={onMore}
          disabled={loading}
        >
          Cargar más fuentes
        </button>
      )}
      <section className="mt-4 border-t pt-3" aria-label="Paciente actual">
        <h2>Paciente actual</h2>
        {canPick ? (
          <>
            {patient && (
              <p className="drive-header-patient">
                {patient.displayName} · {patient.rutMasked}
              </p>
            )}
            {children}
          </>
        ) : (
          <p>Selecciona un paciente para ver sus documentos administrados.</p>
        )}
      </section>
    </div>
  );
}

import { useState } from 'react';
import type { DriveSourceFile } from '../../lib/api';
import { DriveQuickAccess } from './DriveQuickAccess';
import { DriveSourceList } from './DriveSourceList';
import { newestFirst } from './drivePresentation';
import type { DrivePatientContext } from './editors/types';

export function DriveWorkspaceHome({
  files,
  patient = null,
  loading,
  picking,
  onPick,
  onOpen,
  onMore,
}: {
  files: DriveSourceFile[];
  patient?: DrivePatientContext | null;
  loading: boolean;
  picking: boolean;
  onPick: () => void;
  onOpen: (file: DriveSourceFile) => void;
  onMore?: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = files.filter((file) =>
    file.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const visibleFiles = newestFirst(filtered);
  const quickFiles = query.trim() || files.length < 3 ? [] : visibleFiles.slice(0, 3);

  return (
    <div className="drive-workspace-home min-h-0 flex-1 overflow-auto p-3">
      <div className="drive-home-toolbar">
        <label className="drive-search-wrap">
          <span className="sr-only">Buscar notas</span>
          <input
            type="search"
            className="drive-search"
            aria-label="Buscar notas"
            placeholder="Buscar notas en Drive..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="drive-btn drive-btn-primary"
          disabled={picking}
          onClick={onPick}
        >
          {picking ? 'Abriendo…' : 'Abrir desde Drive'}
        </button>
      </div>
      <div className="drive-context-trail" aria-label="Contexto del workspace">
        <span>Google Drive</span>
        <span aria-hidden="true">›</span>
        <span>{patient?.displayName ?? 'Paciente'}</span>
        {patient && (
          <>
            <span aria-hidden="true">·</span>
            <span>{patient.rutMasked}</span>
          </>
        )}
        <span aria-hidden="true">›</span>
        <strong>Notas</strong>
      </div>
      <DriveQuickAccess files={quickFiles} onOpen={onOpen} />
      <h2 className="drive-section-title">Todas las fuentes</h2>
      <DriveSourceList files={visibleFiles} loading={loading} onOpen={onOpen} />
      {!loading && !visibleFiles.length && (
        <p>
          {query
            ? 'Sin coincidencias en las notas cargadas.'
            : 'No hay notas disponibles todavía. Abre una nota desde Google Drive para incorporarla a tu flujo de trabajo.'}
        </p>
      )}
      {onMore && (
        <button
          type="button"
          className="drive-btn drive-btn-secondary"
          onClick={onMore}
          disabled={loading}
        >
          Cargar más notas
        </button>
      )}
    </div>
  );
}

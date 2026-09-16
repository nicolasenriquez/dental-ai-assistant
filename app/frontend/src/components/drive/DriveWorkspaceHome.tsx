import { useState } from 'react';
import type { DriveSourceFile } from '../../lib/api';
import { DriveSourceList } from './DriveSourceList';

export function DriveWorkspaceHome({
  files,
  loading,
  picking,
  onPick,
  onOpen,
  onMore,
}: {
  files: DriveSourceFile[];
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
  return (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <input
        type="search"
        className="drive-search"
        aria-label="Buscar notas"
        placeholder="Buscar notas en Drive..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <button
        type="button"
        className="drive-btn drive-btn-primary my-3"
        disabled={picking}
        onClick={onPick}
      >
        {picking ? 'Abriendo…' : 'Abrir desde Drive'}
      </button>
      <h2>Notas</h2>
      <DriveSourceList files={filtered} loading={loading} onOpen={onOpen} />
      {!loading && !filtered.length && (
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

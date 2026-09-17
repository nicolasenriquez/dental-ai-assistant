import { FileText, Search, X } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';
import type { DriveFile } from '../../lib/api';
import { Spinner } from '../Spinner';
import { DriveFileDetailsView } from './DriveFileDetailsView';
import { DriveFileRow } from './DriveFileRow';

interface DriveFileBrowserProps {
  managedOnly?: boolean;
  patientId: string | null;
  query: string;
  files: DriveFile[];
  listLoading: boolean;
  searchLoading: boolean;
  searchSubmitted: boolean;
  importing: boolean;
  imported: boolean;
  importLabel?: string;
  nextPageToken: string | null;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  onClearSearch: () => void;
  onImport: () => void;
  onOpen: (file: DriveFile) => void;
  onLoadMore: () => void;
  searchInputRef?: RefObject<HTMLInputElement>;
}

function fileTypeLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('google-apps.document')) return 'Google Doc';
  if (mimeType.includes('word')) return 'Word';
  if (mimeType === 'text/markdown') return 'Markdown';
  if (mimeType === 'text/plain') return 'TXT';
  const parts = mimeType.split('/');
  return parts[parts.length - 1]?.toUpperCase() || 'Archivo';
}

function modifiedLabel(modifiedTime: string): string {
  const parsed = new Date(modifiedTime);
  if (Number.isNaN(parsed.getTime())) return 'Fecha desconocida';
  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function SkeletonRows() {
  return (
    <div className="drive-file-skeletons" aria-busy="true" aria-label="Cargando documentos">
      {[0, 1, 2].map((row) => (
        <div className="drive-file-skeleton" key={row}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

export function DriveFileBrowser({
  managedOnly = false,
  patientId,
  query,
  files,
  listLoading,
  searchLoading,
  searchSubmitted,
  importing,
  imported,
  importLabel = 'Importar copia desde Drive',
  nextPageToken,
  onQueryChange,
  onSearch,
  onClearSearch,
  onImport,
  onOpen,
  onLoadMore,
  searchInputRef,
}: DriveFileBrowserProps) {
  const [detailsFile, setDetailsFile] = useState<DriveFile | null>(null);
  const detailsTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setDetailsFile(null);
    detailsTriggerRef.current = null;
  }, [patientId]);

  if (!patientId) {
    return (
      <section className="drive-empty-state" aria-live="polite">
        <FileText aria-hidden="true" size={22} />
        <h3>Seleccionar paciente</h3>
        <p>Los documentos de Drive se muestran después de seleccionar un paciente.</p>
      </section>
    );
  }

  const noMatch = searchSubmitted && query.trim() && !searchLoading && files.length === 0;

  const handleShowDetails = (file: DriveFile, trigger: HTMLButtonElement): void => {
    detailsTriggerRef.current = trigger;
    setDetailsFile(file);
  };

  const handleCloseDetails = (): void => {
    setDetailsFile(null);
    window.requestAnimationFrame(() => detailsTriggerRef.current?.focus());
  };

  return (
    <>
      <section
        className="drive-browser"
        aria-label="Documentos de Google Drive"
        hidden={detailsFile !== null}
      >
        <div className="drive-list-tools">
          <div className="drive-search-wrap">
            <Search aria-hidden="true" size={16} />
            <input
              type="search"
              className="drive-search"
              ref={searchInputRef}
              aria-label="Buscar documentos"
              placeholder="Buscar documentos"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onSearch();
              }}
            />
            {query && (
              <button
                type="button"
                className="drive-search-clear"
                aria-label="Limpiar búsqueda"
                onClick={onClearSearch}
              >
                <X aria-hidden="true" size={15} />
              </button>
            )}
          </div>
          {(listLoading || files.length > 0 || searchSubmitted) && (
            <button
              type="button"
              className="drive-btn drive-btn-primary"
              onClick={onImport}
              disabled={importing}
            >
              {importing ? (
                <>
                  <Spinner /> Importando…
                </>
              ) : (
                importLabel
              )}
            </button>
          )}
          {imported && (
            <span className="drive-doc-saved" role="status" aria-live="polite">
              Documento importado
            </span>
          )}
        </div>
        {searchLoading && <p className="drive-list-status">Buscando…</p>}
        {listLoading ? (
          <>
            <p className="drive-list-status">Cargando documentos…</p>
            <SkeletonRows />
          </>
        ) : noMatch ? (
          <div className="drive-empty-state" aria-live="polite">
            <h3>Sin coincidencias</h3>
            <p>No encontramos documentos para “{query.trim()}”.</p>
            <button type="button" className="drive-btn drive-btn-secondary" onClick={onClearSearch}>
              Limpiar búsqueda
            </button>
          </div>
        ) : files.length === 0 ? (
          <div className="drive-empty-state" aria-live="polite">
            <FileText aria-hidden="true" size={22} />
            <h3>Aún no hay documentos</h3>
            <p>
              {managedOnly
                ? 'Los resultados que guardes desde el Asistente aparecerán aquí.'
                : 'Agrega un documento desde tu Drive para usarlo en el chat.'}
            </p>
            <button
              type="button"
              className="drive-btn drive-btn-primary"
              onClick={onImport}
              disabled={importing}
            >
              {importLabel}
            </button>
          </div>
        ) : (
          <>
            <ul className="drive-file-list">
              {files.map((file) => (
                <DriveFileRow
                  key={file.id}
                  file={file}
                  typeLabel={fileTypeLabel(file.mimeType)}
                  modifiedLabel={modifiedLabel(file.modifiedTime)}
                  onOpen={onOpen}
                  onDetails={handleShowDetails}
                />
              ))}
            </ul>
            {nextPageToken && (
              <button type="button" className="drive-btn drive-btn-secondary" onClick={onLoadMore}>
                Cargar más
              </button>
            )}
          </>
        )}
      </section>
      {detailsFile && (
        <DriveFileDetailsView
          file={detailsFile}
          typeLabel={fileTypeLabel(detailsFile.mimeType)}
          modifiedLabel={modifiedLabel(detailsFile.modifiedTime)}
          onBack={handleCloseDetails}
          onOpen={onOpen}
        />
      )}
    </>
  );
}

import { FileText, LayoutGrid, List, Search, X } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';
import type { DriveFile } from '../../lib/api';
import { Spinner } from '../Spinner';
import { DriveFileDetailsView } from './DriveFileDetailsView';
import { DriveFileIcon } from './DriveFileIcon';
import { DriveFileRow } from './DriveFileRow';
import { DriveQuickAccess } from './DriveQuickAccess';
import { driveTypeLabel, formatDriveDate, newestFirst } from './drivePresentation';
import type { DrivePatientContext } from './editors/types';

interface DriveFileBrowserProps {
  managedOnly?: boolean;
  patientId: string | null;
  patient?: DrivePatientContext | null;
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

type DriveViewMode = 'list' | 'grid';
const VIEW_MODE_KEY = 'dental-ai:drive-file-view-mode:v1';

function readStoredViewMode(): DriveViewMode {
  if (typeof window === 'undefined') return 'list';
  try {
    return window.localStorage.getItem(VIEW_MODE_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
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
  patient = null,
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
  const [viewMode, setViewMode] = useState<DriveViewMode>(readStoredViewMode);
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
  const displayFiles = newestFirst(files);
  const quickFiles = query.trim() || files.length < 3 ? [] : displayFiles.slice(0, 3);

  const changeViewMode = (nextMode: DriveViewMode): void => {
    setViewMode(nextMode);
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, nextMode);
    } catch {
      // View preference is an enhancement and must not block the browser.
    }
  };

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
        <div className="drive-list-tools drive-explorer-toolbar">
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
          <div className="drive-view-toggle" role="group" aria-label="Vista de documentos">
            <button
              type="button"
              aria-label="Vista en cuadrícula"
              aria-pressed={viewMode === 'grid'}
              onClick={() => changeViewMode('grid')}
            >
              <LayoutGrid aria-hidden="true" size={16} />
            </button>
            <button
              type="button"
              aria-label="Vista en lista"
              aria-pressed={viewMode === 'list'}
              onClick={() => changeViewMode('list')}
            >
              <List aria-hidden="true" size={16} />
            </button>
          </div>
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
          <strong>Documentos</strong>
        </div>
        <DriveQuickAccess files={quickFiles} onOpen={onOpen} />
        <h2 className="drive-section-title">Todos los documentos</h2>
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
            {viewMode === 'list' ? (
              <ul className="drive-file-table-body">
                <li className="drive-file-table-header" aria-hidden="true">
                  <span>Nombre</span>
                  <span>Tipo</span>
                  <span>Modificado</span>
                  <span />
                </li>
                {displayFiles.map((file) => (
                  <DriveFileRow
                    key={file.id}
                    file={file}
                    typeLabel={driveTypeLabel(file.mimeType, file.name)}
                    modifiedLabel={formatDriveDate(file.modifiedTime)}
                    onOpen={onOpen}
                    onDetails={handleShowDetails}
                    layout="table"
                  />
                ))}
              </ul>
            ) : (
              <div className="drive-file-grid">
                {displayFiles.map((file) => (
                  <div className="drive-file-card-shell" key={file.id}>
                    <button
                      type="button"
                      className="drive-file-card"
                      aria-label={`Abrir ${file.name}`}
                      onClick={() => onOpen(file)}
                    >
                      <DriveFileIcon mimeType={file.mimeType} name={file.name} size={22} />
                      <strong title={file.name}>{file.name}</strong>
                      <span>{driveTypeLabel(file.mimeType, file.name)}</span>
                      <time dateTime={file.modifiedTime}>{formatDriveDate(file.modifiedTime)}</time>
                    </button>
                    <button
                      type="button"
                      className="drive-file-card-details"
                      aria-label={`Ver detalles de ${file.name}`}
                      onClick={(event) => handleShowDetails(file, event.currentTarget)}
                    >
                      Detalles
                    </button>
                  </div>
                ))}
              </div>
            )}
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
          typeLabel={driveTypeLabel(detailsFile.mimeType, detailsFile.name)}
          modifiedLabel={formatDriveDate(detailsFile.modifiedTime)}
          onBack={handleCloseDetails}
          onOpen={onOpen}
        />
      )}
    </>
  );
}

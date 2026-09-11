import type { Dispatch, SetStateAction } from 'react';
import type { AuthoringRepresentation } from '../../lib/driveDocument';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { Spinner } from '../Spinner';
import { ScrollArea } from '../ui/scroll-area';

export interface DriveDocumentViewModel {
  fileId: string | null;
  boundPatientId: string | null;
  name: string;
  version: string | null;
  mimeType: string;
  content: string;
  baseline: string | null;
  representation: AuthoringRepresentation;
}

function formatLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('google-apps.document')) return 'Google Doc';
  if (mimeType.includes('word')) return 'Word';
  if (mimeType === 'text/plain') return 'TXT';
  const parts = mimeType.split('/');
  return parts[parts.length - 1]?.toUpperCase() || 'Archivo';
}

interface DriveDocumentViewProps {
  doc: DriveDocumentViewModel;
  docPhase: 'opening' | 'ready';
  mode: 'viewing' | 'editing';
  saving: boolean;
  saved: boolean;
  selectedText: string;
  patientId: string | null;
  onBack: () => void;
  onModeChange: (mode: 'viewing' | 'editing') => void;
  onSave: () => void;
  onInsert: (text: string) => void;
  setDoc: Dispatch<SetStateAction<DriveDocumentViewModel | null>>;
  setSelectedText: (text: string) => void;
  onNameChange: (name: string) => void;
}

export function DriveDocumentView({
  doc,
  docPhase,
  mode,
  saving,
  saved,
  selectedText,
  patientId,
  onBack,
  onModeChange,
  onSave,
  onInsert,
  setDoc,
  setSelectedText,
  onNameChange,
}: DriveDocumentViewProps) {
  const canTransfer = Boolean(patientId && doc.boundPatientId === patientId);
  return (
    <section className="drive-doc" aria-label={`Documento ${doc.name}`}>
      <div className="drive-doc-header">
        <button type="button" className="drive-btn drive-btn-secondary" onClick={onBack}>
          Volver
        </button>
        {doc.fileId === null ? (
          <label className="drive-doc-name-input">
            Nombre del documento
            <input
              type="text"
              value={doc.name}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </label>
        ) : (
          <span className="drive-doc-name" title={doc.name}>
            {doc.name}
          </span>
        )}
        <span className="drive-doc-format">{formatLabel(doc.mimeType)}</span>
        <div className="drive-doc-modes" role="group" aria-label="Modo de visualización">
          <button
            type="button"
            aria-pressed={mode === 'viewing'}
            onClick={() => onModeChange('viewing')}
          >
            Vista previa
          </button>
          <button
            type="button"
            aria-pressed={mode === 'editing'}
            onClick={() => onModeChange('editing')}
          >
            Editar
          </button>
        </div>
        {saving && (
          <span className="drive-doc-saved" role="status" aria-label="Guardando…">
            Guardando…
          </span>
        )}
        {!saving && saved && (
          <span className="drive-doc-saved" role="status" aria-label="Guardado">
            Guardado
          </span>
        )}
      </div>
      <ScrollArea className="drive-doc-body">
        {docPhase === 'opening' ? (
          <div className="drive-document-skeleton" aria-busy="true" aria-label="Abriendo documento">
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : mode === 'editing' ? (
          <textarea
            aria-label="Contenido del documento"
            className="drive-doc-editor"
            value={doc.content}
            onChange={(event) =>
              setDoc((prev) => (prev ? { ...prev, content: event.target.value } : prev))
            }
            onSelect={(event) => {
              const target = event.currentTarget;
              setSelectedText(target.value.slice(target.selectionStart, target.selectionEnd));
            }}
          />
        ) : doc.representation === 'persisted_plain_text' ? (
          <pre className="drive-doc-pre">{doc.content}</pre>
        ) : (
          <MarkdownRenderer content={doc.content} />
        )}
      </ScrollArea>
      <footer className="drive-doc-actions">
        {onInsert && (
          <>
            {mode === 'editing' && selectedText && (
              <button
                type="button"
                className="drive-btn drive-btn-secondary"
                disabled={!canTransfer}
                onClick={() => onInsert(selectedText)}
              >
                Insertar selección en el chat
              </button>
            )}
            <button
              type="button"
              className="drive-btn drive-btn-secondary"
              disabled={!canTransfer}
              onClick={() => onInsert(doc.content)}
            >
              Usar en el chat
            </button>
          </>
        )}
        {mode === 'editing' && (
          <button
            type="button"
            className="drive-btn drive-btn-primary"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Spinner /> Guardando…
              </>
            ) : (
              'Guardar cambios'
            )}
          </button>
        )}
      </footer>
    </section>
  );
}

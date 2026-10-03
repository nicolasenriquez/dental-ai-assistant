import { ArrowLeft, X } from 'lucide-react';
import { useState } from 'react';
import { driveTypeLabel } from './drivePresentation';
import { TextDocumentEditor } from './editors/TextDocumentEditor';
import type { DrivePatientContext, SourceWorkspaceDocument } from './editors/types';

interface Props {
  document: SourceWorkspaceDocument;
  patient: DrivePatientContext | null;
  saving: boolean;
  showClose: boolean;
  onBack: () => void;
  onClose: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onInsert?: (value: string) => void;
}

export function DriveDocumentWorkspace({
  document,
  patient,
  saving,
  showClose,
  onBack,
  onClose,
  onChange,
  onSave,
  onInsert,
}: Props) {
  const [selection, setSelection] = useState('');
  const selectionWordCount = selection.trim().split(/\s+/).filter(Boolean).length;
  const { source, content, baseline } = document;
  const text = source.kind === 'text' || source.kind === 'markdown';
  const original = source.webViewLink;
  const safeOriginal =
    original && /^https:\/\/(docs|drive)\.google\.com\//.test(original) ? original : null;
  return (
    <section
      className="drive-document-workspace flex min-h-0 flex-1 flex-col gap-3 p-3"
      aria-label={`Documento ${source.name}`}
    >
      <header className="drive-document-header flex items-center gap-2">
        <button
          type="button"
          className="drive-btn drive-btn-icon"
          aria-label="Volver a Google Drive"
          title="Volver"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" size={18} />
        </button>
        <div className="drive-document-title-group min-w-0 flex-1">
          <h2 title={source.name}>{source.name}</h2>
          <span>
            {driveTypeLabel(source.mimeType, source.name, source.kind)}
            {' · '}
            {source.editable ? 'Editable' : 'Solo lectura'}
          </span>
        </div>
        <span className="drive-document-status" role="status">
          {saving
            ? 'Guardando…'
            : !source.editable
              ? 'Solo lectura'
              : content !== baseline
                ? 'Cambios sin guardar'
                : 'Guardado'}
        </span>
        {text && content !== baseline && (
          <button
            type="button"
            className="drive-btn drive-btn-primary"
            disabled={saving || !source.editable}
            onClick={onSave}
          >
            Guardar
          </button>
        )}
        {showClose && (
          <button
            type="button"
            className="drive-btn drive-btn-icon"
            aria-label="Cerrar espacio"
            title="Cerrar espacio"
            onClick={onClose}
          >
            <X aria-hidden="true" size={18} />
          </button>
        )}
      </header>
      {text ? (
        <TextDocumentEditor
          value={content}
          onChange={onChange}
          onSelectionChange={setSelection}
          readOnly={!source.editable || saving}
        />
      ) : (
        <div className="drive-empty-state">
          <p>
            Este formato se abre en Google Drive. La edición integrada todavía no está disponible.
          </p>
          {safeOriginal && (
            <a href={safeOriginal} target="_blank" rel="noopener noreferrer">
              {source.kind === 'google-doc'
                ? 'Abrir original en Google Docs'
                : 'Abrir original en Drive'}
            </a>
          )}
        </div>
      )}
      {onInsert && text && (
        <footer className={`drive-doc-actions${selection.trim() ? ' drive-selection-bar' : ''}`}>
          {selection.trim() && (
            <div className="drive-selection-context">
              <strong>{selectionWordCount} palabras seleccionadas</strong>
              {patient ? (
                <span>
                  {patient.displayName} · {patient.rutMasked}
                </span>
              ) : (
                <span>Selecciona un paciente antes de usar este fragmento.</span>
              )}
            </div>
          )}
          {selection.trim() && (
            <button
              type="button"
              className="drive-btn drive-btn-primary"
              disabled={!patient}
              onClick={() => onInsert(selection)}
            >
              Incorporar al borrador
            </button>
          )}
          <button
            type="button"
            className="drive-btn drive-btn-secondary"
            disabled={!patient}
            onClick={() => onInsert(content)}
          >
            Incorporar nota completa al borrador
          </button>
          {!patient && !selection.trim() && (
            <p className="drive-insert-prerequisite">
              Selecciona un paciente para insertar este contenido.
            </p>
          )}
        </footer>
      )}
    </section>
  );
}

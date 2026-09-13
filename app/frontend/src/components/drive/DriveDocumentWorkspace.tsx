import { ArrowLeft, X } from 'lucide-react';
import { useState } from 'react';
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
  onInsert: (value: string) => void;
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
  const { source, content, baseline } = document;
  const text = source.kind === 'text' || source.kind === 'markdown';
  const original = source.webViewLink;
  const safeOriginal =
    original && /^https:\/\/(docs|drive)\.google\.com\//.test(original) ? original : null;
  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-3 p-3"
      aria-label={`Documento ${source.name}`}
    >
      <header className="flex items-center gap-2">
        <button
          type="button"
          className="drive-btn drive-btn-icon"
          aria-label="Volver a Google Drive"
          title="Volver"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" size={18} />
        </button>
        <h2 className="min-w-0 flex-1 truncate" title={source.name}>
          {source.name}
        </h2>
        <span role="status">
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
            disabled={saving || !source.editable || !source.version}
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
      {selection && (
        <footer className="flex flex-wrap items-center gap-2">
          <span>{selection.trim().split(/\s+/).filter(Boolean).length} palabras</span>
          <p>
            {patient
              ? `Usar para: ${patient.displayName} · ${patient.rutMasked}`
              : 'Selecciona un paciente antes de usar este fragmento.'}
          </p>
          <button
            type="button"
            className="drive-btn drive-btn-primary"
            disabled={!patient}
            onClick={() => onInsert(selection)}
          >
            Usar selección en Assistant
          </button>
        </footer>
      )}
    </section>
  );
}

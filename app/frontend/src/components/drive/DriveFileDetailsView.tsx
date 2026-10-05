import { ArrowLeft, CalendarClock, FileText, FolderOpen, Tag } from 'lucide-react';

import type { DriveFile } from '../../lib/api';

interface DriveFileDetailsViewProps {
  file: DriveFile;
  typeLabel: string;
  modifiedLabel: string;
  onBack: () => void;
  onOpen: (file: DriveFile) => void;
}

interface DetailRowProps {
  label: string;
  value: string;
  icon: typeof Tag;
}

function DetailRow({ label, value, icon: Icon }: DetailRowProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
      <Icon
        aria-hidden="true"
        size={16}
        strokeWidth={1.8}
        className="mt-0.5 shrink-0 text-[var(--text-tertiary)]"
      />

      <div className="min-w-0 flex-1">
        <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
          {label}
        </dt>
        <dd className="mt-1 break-words text-[13px] text-[var(--text-primary)]">{value}</dd>
      </div>
    </div>
  );
}

export function DriveFileDetailsView({
  file,
  typeLabel,
  modifiedLabel,
  onBack,
  onOpen,
}: DriveFileDetailsViewProps) {
  return (
    <section aria-labelledby="drive-file-details-title" className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-2.5">
        <button
          autoFocus
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          aria-label="Volver a documentos"
          title="Volver a documentos"
        >
          <ArrowLeft aria-hidden="true" size={17} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-[var(--text-tertiary)]">Detalles del documento</p>
          <h3
            id="drive-file-details-title"
            title={file.name}
            className="truncate text-[13px] font-medium text-[var(--text-primary)]"
          >
            {file.name}
          </h3>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex flex-col items-start rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
          <span
            aria-hidden="true"
            className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--text-secondary)]"
          >
            <FileText size={19} strokeWidth={1.8} />
          </span>

          <strong className="break-words text-sm font-medium text-[var(--text-primary)]">
            {file.name}
          </strong>
          <span className="mt-1 text-xs text-[var(--text-tertiary)]">
            Administrado por Dental AI Assistant
          </span>

          <button
            type="button"
            onClick={() => onOpen(file)}
            className="mt-4 min-h-9 rounded-lg bg-[var(--accent)] px-3 text-xs font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          >
            Abrir documento
          </button>
        </div>

        <dl className="grid gap-2">
          <DetailRow icon={Tag} label="Tipo" value={typeLabel} />
          <DetailRow icon={CalendarClock} label="Última modificación" value={modifiedLabel} />
          <DetailRow icon={FolderOpen} label="Ubicación" value="Documentos del paciente" />
        </dl>
      </div>
    </section>
  );
}

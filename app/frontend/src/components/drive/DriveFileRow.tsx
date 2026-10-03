import { Info } from 'lucide-react';

import type { DriveFile } from '../../lib/api';
import { DriveFileIcon } from './DriveFileIcon';

interface DriveFileRowProps {
  file: DriveFile;
  typeLabel: string;
  modifiedLabel: string;
  onOpen: (file: DriveFile) => void;
  onDetails: (file: DriveFile, trigger: HTMLButtonElement) => void;
  layout?: 'default' | 'table';
}

export function DriveFileRow({
  file,
  typeLabel,
  modifiedLabel,
  onOpen,
  onDetails,
  layout = 'default',
}: DriveFileRowProps) {
  const isTable = layout === 'table';

  return (
    <li
      className={`group flex min-h-14 items-stretch gap-1 border-b border-[var(--border)] last:border-b-0${isTable ? ' drive-file-table-row' : ''}`}
    >
      <button
        type="button"
        aria-label={`Abrir ${file.name}`}
        onClick={() => onOpen(file)}
        className="drive-file-open flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--text-secondary)]"
        >
          <DriveFileIcon mimeType={file.mimeType} name={file.name} size={16} />
        </span>

        <span
          className="drive-file-open-main min-w-0 flex-1"
          data-mobile-meta={isTable ? `${typeLabel} · Modificado ${modifiedLabel}` : undefined}
        >
          <strong
            title={file.name}
            className="block truncate text-[13px] font-medium text-[var(--text-primary)]"
          >
            {file.name}
          </strong>

          {!isTable && (
            <span className="drive-file-open-meta mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[11px] text-[var(--text-tertiary)]">
              <span>{typeLabel}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={file.modifiedTime}>Modificado {modifiedLabel}</time>
            </span>
          )}
        </span>
      </button>

      {isTable && (
        <>
          <span className="drive-file-table-type">{typeLabel}</span>
          <time className="drive-file-table-date" dateTime={file.modifiedTime}>
            {modifiedLabel}
          </time>
        </>
      )}

      <button
        type="button"
        aria-label={`Ver detalles de ${file.name}`}
        title="Ver detalles"
        onClick={(event) => onDetails(file, event.currentTarget)}
        className="my-auto mr-1 flex !h-9 !w-9 shrink-0 items-center justify-center rounded-lg !p-0 text-[var(--text-tertiary)] transition-colors duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <Info aria-hidden="true" size={16} strokeWidth={1.8} />
      </button>
    </li>
  );
}

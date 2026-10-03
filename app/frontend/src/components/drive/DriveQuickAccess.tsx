import type { DriveFile, DriveSourceFile } from '../../lib/api';
import { DriveFileIcon } from './DriveFileIcon';
import { driveTypeLabel, formatDriveDate } from './drivePresentation';

type DriveQuickAccessFile = DriveFile | DriveSourceFile;

interface DriveQuickAccessProps<T extends DriveQuickAccessFile> {
  files: T[];
  onOpen: (file: T) => void;
}

export function DriveQuickAccess<T extends DriveQuickAccessFile>({
  files,
  onOpen,
}: DriveQuickAccessProps<T>) {
  if (files.length === 0) return null;

  return (
    <section className="drive-quick-access" aria-labelledby="drive-quick-access-title">
      <div className="drive-section-heading">
        <h2 id="drive-quick-access-title">Acceso rápido</h2>
        <span>Más recientes</span>
      </div>
      <div className="drive-quick-grid">
        {files.map((file) => (
          <button
            type="button"
            className="drive-quick-card"
            key={file.id}
            aria-label={`Acceso rápido: Abrir ${file.name}`}
            onClick={() => onOpen(file)}
          >
            <DriveFileIcon
              mimeType={file.mimeType}
              name={file.name}
              kind={'kind' in file ? file.kind : undefined}
              size={20}
            />
            <strong title={file.name}>{file.name}</strong>
            <span>
              {driveTypeLabel(file.mimeType, file.name, 'kind' in file ? file.kind : undefined)}
              {' · '}
              {formatDriveDate(file.modifiedTime)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

import type { DriveSourceFile } from '../../lib/api';
import { DriveFileIcon } from './DriveFileIcon';
import { driveTypeLabel, formatDriveDate } from './drivePresentation';

export function DriveSourceList({
  files,
  loading,
  onOpen,
}: { files: DriveSourceFile[]; loading: boolean; onOpen: (file: DriveSourceFile) => void }) {
  if (loading)
    return (
      <div aria-busy="true" aria-label="Cargando fuentes" className="drive-file-skeletons">
        {[0, 1, 2].map((id) => (
          <div key={id} className="drive-file-skeleton">
            <span />
            <span />
          </div>
        ))}
      </div>
    );
  return (
    <ul className="drive-file-list">
      {files.map((file) => (
        <li key={file.id}>
          <button type="button" className="drive-file-row" onClick={() => onOpen(file)}>
            <DriveFileIcon mimeType={file.mimeType} name={file.name} kind={file.kind} />
            <span className="drive-file-main">
              <strong>{file.name}</strong>
              <span>{driveTypeLabel(file.mimeType, file.name, file.kind)}</span>
              <span>{file.editable ? 'Editable' : 'Solo lectura'}</span>
            </span>
            <time dateTime={file.modifiedTime}>{formatDriveDate(file.modifiedTime)}</time>
          </button>
        </li>
      ))}
    </ul>
  );
}

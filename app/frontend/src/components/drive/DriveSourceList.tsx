import { FileText } from 'lucide-react';
import type { DriveSourceFile } from '../../lib/api';

function kindLabel(kind: DriveSourceFile['kind']): string {
  if (kind === 'google-doc') return 'Google Doc';
  return kind.toUpperCase();
}

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
            <FileText aria-hidden="true" size={18} />
            <span className="drive-file-main">
              <strong>{file.name}</strong>
              <span>{kindLabel(file.kind)}</span>
            </span>
            <time dateTime={file.modifiedTime}>
              {new Date(file.modifiedTime).toLocaleDateString('es-CL')}
            </time>
          </button>
        </li>
      ))}
    </ul>
  );
}

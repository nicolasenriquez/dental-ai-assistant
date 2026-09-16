import { HardDrive, X } from 'lucide-react';
import type { DriveStatus } from '../../lib/api';
import type { DrivePatientContext } from './editors/types';

interface DriveWorkspaceHeaderProps {
  status: DriveStatus | null;
  patient?: DrivePatientContext | null;
  onClose?: () => void;
}

export function DriveWorkspaceHeader({ status, patient, onClose }: DriveWorkspaceHeaderProps) {
  const connected = status?.status === 'connected';
  return (
    <header className="drive-workspace-header">
      <div className="drive-workspace-heading">
        <HardDrive aria-hidden="true" size={18} strokeWidth={1.8} />
        <div>
          <h2 className="drive-header-title">Google Drive</h2>
          {connected && (
            <p className="drive-header-status">
              <span>Conectado</span>
            </p>
          )}
          {patient && (
            <p className="drive-workspace-patient-context">
              Contexto activo · {patient.displayName} · {patient.rutMasked}
            </p>
          )}
        </div>
      </div>
      {onClose && (
        <button
          type="button"
          className="drive-btn drive-btn-icon"
          aria-label="Cerrar espacio"
          title="Cerrar espacio"
          onClick={onClose}
        >
          <X aria-hidden="true" size={16} strokeWidth={1.8} />
        </button>
      )}
    </header>
  );
}

import { HardDrive, X } from 'lucide-react';
import type { DriveStatus } from '../../lib/api';

interface DriveWorkspaceHeaderProps {
  status: DriveStatus | null;
  patientId: string | null;
  onClose?: () => void;
}

export function DriveWorkspaceHeader({ status, patientId, onClose }: DriveWorkspaceHeaderProps) {
  const connected = status?.status === 'connected';
  return (
    <header className="drive-workspace-header">
      <div className="drive-workspace-heading">
        <HardDrive aria-hidden="true" size={18} strokeWidth={1.8} />
        <div>
          <h2 className="drive-header-title">Google Drive</h2>
          {connected && (
            <p className="drive-header-status">
              <span>Conectado</span> · Dental AI Workspace
            </p>
          )}
          {patientId && <p className="drive-header-patient">Paciente activo</p>}
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

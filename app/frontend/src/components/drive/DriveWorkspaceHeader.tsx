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
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="drive-header-title">Google Drive</h2>
            {connected && (
              <span className="drive-header-status flex items-center gap-1.5">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                Conectado
              </span>
            )}
          </div>
          {patient && (
            <p className="drive-workspace-patient-context flex min-w-0 items-center gap-1.5">
              <span>Paciente</span>
              <strong
                className="truncate font-medium text-[var(--text-primary)]"
                title={patient.displayName}
              >
                {patient.displayName}
              </strong>
              <span aria-hidden="true">·</span>
              <span>{patient.rutMasked}</span>
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

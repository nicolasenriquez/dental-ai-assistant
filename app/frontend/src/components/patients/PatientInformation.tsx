import { Copy } from 'lucide-react';
import { useState } from 'react';
import type { Patient } from '../../lib/api';
import { PatientIdentity } from '../PatientIdentity';

export function PatientInformation({ patient }: { patient: Patient }): JSX.Element {
  const [status, setStatus] = useState('');
  const copy = async (value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('Copiado');
    } catch {
      setStatus('No pudimos copiar. Selecciona el texto o reintenta.');
    }
  };
  return (
    <section
      className="space-y-4 rounded border border-border p-5"
      aria-label="Información personal"
    >
      <h2 className="text-lg font-semibold">Información personal</h2>
      <PatientIdentity patient={patient} />
      <dl className="space-y-3">
        {(
          [
            ['Teléfono', patient.phone],
            ['Correo', patient.email],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="flex items-center gap-2 break-all">
              {value || 'No registrado'}
              {value && (
                <button
                  type="button"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`Copiar ${label.toLowerCase()}`}
                  title={`Copiar ${label.toLowerCase()}`}
                  onClick={() => void copy(value)}
                >
                  <Copy size={16} aria-hidden="true" />
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p role="status" className="text-sm text-muted">
        {status}
      </p>
    </section>
  );
}

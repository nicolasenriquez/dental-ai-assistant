import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type Patient, getPatient } from '../lib/api';

export function PatientDetail() {
  const { patientId = '' } = useParams<{ patientId: string }>();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      setPatient(await getPatient(patientId));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [patientId]);

  return (
    <main className="min-h-full bg-[var(--bg)] text-[var(--text-primary)] p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <Link to="/patients" className="text-sm text-[var(--accent)] hover:underline">‹ Pacientes</Link>
        {loading ? (
          <p className="mt-8 text-[var(--text-secondary)]">Cargando paciente...</p>
        ) : error || !patient ? (
          <div role="alert" className="mt-8 text-[var(--danger)]">
            <p>No pudimos cargar el paciente</p>
            <button type="button" onClick={() => void load()} className="mt-3 underline">Reintentar</button>
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-start justify-between gap-4 mt-4">
              <div>
                <h1 className="text-2xl font-semibold">{patient.first_name} {patient.last_name}</h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  RUT {patient.rut_masked}{patient.birth_date ? ` · Nacimiento ${new Date(`${patient.birth_date}T00:00:00`).toLocaleDateString('es-CL')}` : ''}
                </p>
              </div>
              <button type="button" disabled className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white opacity-60">+ Nueva evolucion</button>
            </header>
            <h2 className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] mt-8">HISTORIAL DE EVOLUCIONES</h2>
            <div className="mt-3 p-8 text-center bg-[var(--surface-1)] border border-[var(--border)] rounded-lg text-[var(--text-secondary)]">
              Este paciente aun no tiene evoluciones
            </div>
          </>
        )}
      </div>
    </main>
  );
}

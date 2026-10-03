import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPatientAge } from '../../lib/age';
import type { Patient } from '../../lib/api';
import { formatClinicalDateTime } from '../../lib/clinicalDate';

export function PatientDirectoryResults({ patients }: { patients: Patient[] }) {
  const [desktop, setDesktop] = useState(
    () => window.matchMedia?.('(min-width: 1024px)').matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.('(min-width: 1024px)');
    if (!media) return;
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  const identity = (patient: Patient) => (
    <span className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-sm text-muted"
      >
        {patient.first_name[0]}
        {patient.last_name[0]}
      </span>
      <strong className="min-w-0 break-words text-sm font-semibold">
        {patient.first_name} {patient.last_name}
      </strong>
    </span>
  );
  const age = (patient: Patient): string => {
    const years = getPatientAge(patient.birth_date);
    return years === null ? 'Edad no registrada' : `${years} años`;
  };
  const evolution = (patient: Patient) =>
    patient.last_evolution_at ? (
      <time dateTime={patient.last_evolution_at}>
        {formatClinicalDateTime(patient.last_evolution_at)}
      </time>
    ) : (
      <span>Sin evoluciones</span>
    );

  return desktop ? (
    <table className="w-full table-fixed text-left text-sm">
      <caption className="sr-only">Pacientes encontrados</caption>
      <thead className="border-b border-border text-muted">
        <tr>
          <th scope="col" className="w-1/2 px-4 py-3">
            Paciente
          </th>
          <th scope="col" className="px-4 py-3">
            Edad
          </th>
          <th scope="col" className="px-4 py-3">
            Última evolución
          </th>
          <th scope="col" className="w-10">
            <span className="sr-only">Abrir ficha</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {patients.map((patient) => (
          <tr
            key={patient.id}
            className="relative border-b border-border last:border-0 hover:bg-surface-raised focus-within:bg-surface-raised"
          >
            <td className="px-4 py-4">
              <Link
                to={`/patients/${patient.id}`}
                className="block after:absolute after:inset-0 after:rounded focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-primary"
              >
                {identity(patient)}
              </Link>
            </td>
            <td className="px-4 py-4 text-muted">{age(patient)}</td>
            <td className="px-4 py-4 text-muted">{evolution(patient)}</td>
            <td>
              <ChevronRight aria-hidden="true" size={18} strokeWidth={1.8} className="text-muted" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <div>
      {patients.map((patient) => (
        <Link
          key={patient.id}
          to={`/patients/${patient.id}`}
          className="flex min-h-16 items-center gap-3 border-b border-border p-4 last:border-0 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <span className="min-w-0 flex-1">
            {identity(patient)}
            <span className="mt-2 block text-sm text-muted">{age(patient)}</span>
            <span className="mt-1 block text-sm text-muted">
              Última evolución: {evolution(patient)}
            </span>
          </span>
          <ChevronRight
            aria-hidden="true"
            size={18}
            strokeWidth={1.8}
            className="shrink-0 text-muted"
          />
        </Link>
      ))}
    </div>
  );
}

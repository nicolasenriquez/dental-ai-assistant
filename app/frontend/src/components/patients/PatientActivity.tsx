import { FileText, NotebookPen, Stethoscope } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePatientActivity } from '../../hooks/usePatientActivity';
import type { PatientActivityFilter, PatientActivityItem } from '../../lib/api';
import {
  formatClinicalDate,
  formatClinicalDateLong,
  formatClinicalTime,
} from '../../lib/clinicalDate';
import { Button } from '../ui/Button';
import { PatientActorLabel } from './PatientActorLabel';

const filters = [
  { kind: 'all', label: 'Todos' },
  { kind: 'evolutions', label: 'Evoluciones' },
  { kind: 'notes', label: 'Notas' },
  { kind: 'diagnoses', label: 'Diagnósticos' },
] as const;
const icons = { evolutions: FileText, notes: NotebookPen, diagnoses: Stethoscope };
const labels = { evolutions: 'Evolución', notes: 'Nota', diagnoses: 'Diagnóstico' };

export function PatientActivity({ patientId }: { patientId: string }) {
  const [kind, setKind] = useState<PatientActivityFilter>('all');
  const { page, loading, error, retry, loadMore } = usePatientActivity(patientId, kind);
  const days = new Map<string, PatientActivityItem[]>();
  for (const item of page?.items ?? []) {
    const day = formatClinicalDate(item.occurred_at);
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  return (
    <section aria-label="Actividad del paciente" className="space-y-5">
      <h2 className="text-lg font-semibold">Actividad del paciente</h2>
      <p className="text-sm text-muted">
        Evoluciones aprobadas y cambios guardados en notas y diagnósticos.
      </p>
      <div
        className="patient-activity-filters flex flex-wrap gap-2"
        role="group"
        aria-label="Filtrar actividad"
      >
        {filters.map((filter) => (
          <button
            key={filter.kind}
            type="button"
            aria-pressed={kind === filter.kind}
            className={`min-h-[44px] min-w-[44px] rounded border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-primary ${kind === filter.kind ? 'border-primary bg-surface font-semibold text-foreground' : 'border-border text-muted hover:bg-surface hover:text-foreground'}`}
            onClick={() => setKind(filter.kind)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      {page && (
        <p className="text-sm text-muted" aria-live="polite">
          {page.total} {page.total === 1 ? 'evento' : 'eventos'}
          {error ? ' · Lectura incompleta' : ''}
        </p>
      )}
      {loading && <p role="status">Cargando actividad…</p>}
      {error && (
        <div role="alert" className="space-y-2 text-error">
          <p>No pudimos cargar {page ? 'toda la actividad' : 'la actividad'}.</p>
          <Button variant="clinicalSecondary" disabled={loading} onClick={() => void retry()}>
            Reintentar actividad
          </Button>
        </div>
      )}
      {!loading && !error && page?.total === 0 && (
        <div className="space-y-3">
          <p>{kind === 'all' ? 'Sin actividad guardada' : 'Sin eventos en esta categoría'}</p>
          {kind !== 'all' && (
            <Button variant="clinicalSecondary" onClick={() => setKind('all')}>
              Mostrar todo
            </Button>
          )}
        </div>
      )}
      {[...days].map(([day, items]) => (
        <section key={day} aria-label={`Actividad del ${day}`}>
          <h3 className="mb-3 text-sm font-semibold">
            {formatClinicalDateLong(items[0].occurred_at)}
          </h3>
          <ol className="space-y-4 border-l border-border pl-4">
            {items.map((item) => {
              const Icon = icons[item.kind];
              return (
                <li key={`${item.kind}:${item.event_id}`} className="flex min-w-0 gap-3">
                  <Icon size={18} aria-hidden="true" className="mt-1 shrink-0 text-muted" />
                  <div className="min-w-0 space-y-1">
                    <Link
                      to={item.href}
                      className="inline-flex min-h-[44px] items-center gap-2 break-words text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {item.title}
                      {item.tooth_fdi !== null && ` · Pieza ${item.tooth_fdi}`}
                    </Link>
                    <p className="text-sm text-muted">
                      {labels[item.kind]} ·{' '}
                      <time dateTime={item.occurred_at}>
                        {formatClinicalTime(item.occurred_at)}
                      </time>
                    </p>
                    <PatientActorLabel
                      actor={item.actor}
                      actors={page?.items.flatMap((event) => (event.actor ? [event.actor] : []))}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {page?.next_cursor && !error && (
        <Button variant="clinicalSecondary" disabled={loading} onClick={() => void loadMore()}>
          Cargar más actividad
        </Button>
      )}
      {page && page.items.length > 0 && !page.next_cursor && !loading && !error && (
        <p className="text-sm text-muted">Fin de la actividad</p>
      )}
    </section>
  );
}

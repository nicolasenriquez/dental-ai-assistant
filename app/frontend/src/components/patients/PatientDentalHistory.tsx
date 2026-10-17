import { useState } from 'react';
import { type HistoryEvents, usePatientDentalHistory } from '../../hooks/usePatientDentalHistory';
import type {
  ConditionCatalog,
  ConditionSnapshot,
  DentalHistoryEvent,
  DentalHistorySnapshot,
  Dentition,
  PatientTreatment,
} from '../../lib/api';
import {
  formatClinicalDateShort,
  formatClinicalDayShort,
  formatClinicalTime,
} from '../../lib/clinicalDate';
import {
  type ChartCondition,
  resolveCondition,
  surfaceDescription,
  treatmentStateLabel,
} from '../../lib/odontogramPresentation';
import { EmptyState } from '../patterns/EmptyState';
import { Button } from '../ui/Button';
import { DentalHistoryTimeline } from './DentalHistoryTimeline';
import { PatientActorLabel } from './PatientActorLabel';
import { PatientOdontogram } from './PatientOdontogram';
import { ToothInspectionPopover } from './ToothInspectionPopover';
import { toothFamily } from './toothGeometry';

interface PatientDentalHistoryProps {
  patientId: string;
  at: string | null;
  dentition: string | null;
  onSelectDay: (day: string | null) => void;
  onSelectDentition: (dentition: Dentition) => void;
  onLeave: () => void;
}

const conditionStatusLabels: Record<ConditionSnapshot['status'], string> = {
  active: 'Activa',
  resolved: 'Resuelta',
  entered_in_error: 'Registrada por error',
};

const toothFamilyLabels = {
  incisor: 'Incisivo',
  canine: 'Canino',
  premolar: 'Premolar',
  molar: 'Molar',
} as const;

function isClinicalDay(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

function isCondition(snapshot: DentalHistorySnapshot): snapshot is ConditionSnapshot {
  return 'condition_code' in snapshot;
}

function actionLabel(event: DentalHistoryEvent): string {
  const feminine = event.resource_kind === 'condition';
  return {
    created: feminine ? 'Creada' : 'Creado',
    edited: feminine ? 'Editada' : 'Editado',
    resolved: 'Resuelta',
    corrected: feminine ? 'Corregida' : 'Corregido',
    deleted: feminine ? 'Eliminada' : 'Eliminado',
  }[event.action];
}

function treatmentScope(record: PatientTreatment): string {
  if (record.arch) return `Arcada ${record.arch === 'upper' ? 'superior' : 'inferior'}`;
  return record.teeth
    .map((member) => {
      const role =
        member.role === 'pillar' ? ' (pilar)' : member.role === 'pontic' ? ' (póntico)' : '';
      return `Pieza ${member.tooth_fdi}${role}`;
    })
    .join(', ');
}

function describeSnapshot(
  snapshot: DentalHistorySnapshot,
  labels: Record<string, string>,
  catalog: ConditionCatalog | null,
): string {
  if (isCondition(snapshot)) {
    return `Pieza ${snapshot.tooth_fdi} · ${labels[snapshot.condition_code] ?? resolveCondition(catalog, snapshot.condition_code).label} · ${conditionStatusLabels[snapshot.status]} · ${surfaceDescription(catalog, snapshot.condition_code, snapshot.surfaces)}`;
  }
  return `${snapshot.label_es} · ${treatmentStateLabel(snapshot.state)} · ${treatmentScope(snapshot)}`;
}

function snapshotNote(snapshot: DentalHistorySnapshot): string | null {
  return (isCondition(snapshot) ? snapshot.note : snapshot.note) ?? null;
}

function RevisionDetail({
  label,
  snapshot,
  labels,
  catalog,
}: {
  label: string;
  snapshot: DentalHistorySnapshot;
  labels: Record<string, string>;
  catalog: ConditionCatalog | null;
}): JSX.Element {
  const note = snapshotNote(snapshot);
  return (
    <div className="mt-1">
      <p>
        <strong>{label}</strong> · {describeSnapshot(snapshot, labels, catalog)}
      </p>
      {note ? <p className="whitespace-pre-wrap break-words">{note}</p> : null}
    </div>
  );
}

function HistoryEventList({
  heading,
  loadedLabel,
  emptyMessage,
  failureMessage,
  events,
  loading,
  pagination,
  onRetry,
  labels,
  catalog,
}: {
  heading: string;
  loadedLabel: string;
  emptyMessage: string;
  failureMessage: string;
  events: HistoryEvents;
  loading: boolean;
  pagination?: { label: string; onLoadMore: () => void };
  onRetry: () => void;
  labels: Record<string, string>;
  catalog: ConditionCatalog | null;
}): JSX.Element {
  const actors = events.items.map((event) => event.actor);
  return (
    <section aria-label={heading} className="space-y-2">
      <h4 className="font-medium">{heading}</h4>
      <p className="text-sm text-muted">{loadedLabel}</p>
      {events.failed ? (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <p>{failureMessage}</p>
          <Button variant="clinicalSecondary" onClick={onRetry}>
            Reintentar
          </Button>
        </div>
      ) : loading && !events.items.length ? (
        <p role="status">Cargando eventos…</p>
      ) : events.items.length === 0 ? (
        <p>{emptyMessage}</p>
      ) : (
        <ol className="space-y-3">
          {events.items.map((event) => (
            <li key={event.event_id}>
              <article className="space-y-1 border-l border-border pl-3 text-sm">
                <h5>{actionLabel(event)}</h5>
                <p className="text-xs text-muted">
                  {formatClinicalDateShort(event.changed_at)} {formatClinicalTime(event.changed_at)}{' '}
                  · Revisión {event.revision} · {formatClinicalDayShort(event.clinical_date)}
                </p>
                <p>{describeSnapshot(event.after, labels, catalog)}</p>
                <PatientActorLabel actor={event.actor} actors={actors} compact />
                <details>
                  <summary className="cursor-pointer text-xs text-muted">
                    Estado de la revisión
                  </summary>
                  {event.before ? (
                    <RevisionDetail
                      label="Antes"
                      snapshot={event.before}
                      labels={labels}
                      catalog={catalog}
                    />
                  ) : null}
                  <RevisionDetail
                    label="Después"
                    snapshot={event.after}
                    labels={labels}
                    catalog={catalog}
                  />
                </details>
              </article>
            </li>
          ))}
        </ol>
      )}
      {pagination && events.nextCursor ? (
        <Button variant="clinicalSecondary" disabled={loading} onClick={pagination.onLoadMore}>
          {pagination.label}
        </Button>
      ) : null}
    </section>
  );
}

export function PatientDentalHistory({
  patientId,
  at,
  dentition,
  onSelectDay,
  onSelectDentition,
  onLeave,
}: PatientDentalHistoryProps): JSX.Element {
  const invalidDay = at !== null && !isClinicalDay(at);
  const invalidDentition =
    dentition !== null && dentition !== 'permanent' && dentition !== 'primary';
  if (invalidDay || invalidDentition) {
    return (
      <section aria-label="Historial dental" className="space-y-3">
        <h3 className="font-semibold">Historial</h3>
        <div role="alert" className="space-y-2 rounded border border-border bg-surface p-3 text-sm">
          {invalidDay ? (
            <p>La fecha solicitada no es válida. No mostramos el estado actual como ese día.</p>
          ) : null}
          {invalidDentition ? <p>La dentición solicitada no es válida.</p> : null}
          <div className="flex flex-wrap gap-2">
            {invalidDay ? (
              <Button variant="clinicalSecondary" onClick={() => onSelectDay(null)}>
                Volver al estado actual
              </Button>
            ) : null}
            {invalidDentition
              ? (['permanent', 'primary'] as const).map((mode) => (
                  <Button
                    key={mode}
                    variant="clinicalSecondary"
                    onClick={() => onSelectDentition(mode)}
                  >
                    {mode === 'permanent' ? 'Permanente' : 'Temporal'}
                  </Button>
                ))
              : null}
            <Button variant="clinicalSecondary" onClick={onLeave}>
              Ir a Diagnóstico
            </Button>
          </div>
        </div>
      </section>
    );
  }
  return (
    <HistoryWorkspace
      patientId={patientId}
      at={at}
      dentition={dentition ?? 'permanent'}
      onSelectDay={onSelectDay}
      onSelectDentition={onSelectDentition}
      onLeave={onLeave}
    />
  );
}

function HistoryWorkspace({
  patientId,
  at,
  dentition,
  onSelectDay,
  onSelectDentition,
  onLeave,
}: Omit<PatientDentalHistoryProps, 'dentition'> & { dentition: Dentition }): JSX.Element {
  const reads = usePatientDentalHistory(patientId, dentition, at);
  const [inspection, setInspection] = useState<{ tooth: number; anchor: HTMLElement } | null>(null);
  const [highlightedTooth, setHighlightedTooth] = useState(0);
  const chart = reads.chart;
  const items = chart?.items ?? [];
  const conditions: ChartCondition[] = items
    .filter((item) => item.resource_kind === 'condition')
    .map((item) => ({ id: item.resource_id, ...(item.snapshot as ConditionSnapshot) }));
  const treatments: PatientTreatment[] = items
    .filter((item) => item.resource_kind === 'procedure')
    .map((item) => item.snapshot as PatientTreatment);
  const labels = Object.fromEntries(
    [
      ...new Set([
        ...(reads.catalog?.conditions.map((entry) => entry.code) ?? []),
        ...conditions.map((condition) => condition.condition_code),
      ]),
    ].map((code) => [code, resolveCondition(reads.catalog, code).label]),
  );
  const loadedDates = [...new Set(reads.events.items.map((event) => event.clinical_date))].sort(
    (a, b) => b.localeCompare(a),
  );
  const actorFor = (kind: 'condition' | 'procedure', id: string, revision: number) =>
    [...reads.events.items, ...reads.dayEvents.items].find(
      (event) =>
        event.resource_kind === kind && event.resource_id === id && event.revision === revision,
    )?.actor ?? null;
  const readLabel = chart
    ? chart.at
      ? `Registros guardados hasta el ${formatClinicalDayShort(chart.at)}`
      : 'Estado actual'
    : at
      ? `Historial solicitado hasta el ${formatClinicalDayShort(at)}`
      : 'Estado actual';
  const coverageWarnings = (chart?.coverage.warnings ?? []).map((warning) =>
    warning === 'missing_initial_revision'
      ? 'un registro conocido no conserva su revisión inicial'
      : 'hay revisiones sin revisión inicial asociada',
  );
  const empty = !!chart && chart.counts.records === 0 && chart.counts.deleted_records === 0;
  const problems = reads.stale || reads.invalidSelection || reads.chartFailed;
  const toothConditions = inspection
    ? items.filter(
        (item) =>
          item.resource_kind === 'condition' &&
          (item.snapshot as ConditionSnapshot).tooth_fdi === inspection.tooth,
      )
    : [];
  const toothTreatments = inspection
    ? items.filter(
        (item) =>
          item.resource_kind === 'procedure' &&
          (item.snapshot as PatientTreatment).teeth.some(
            (member) => member.tooth_fdi === inspection.tooth,
          ),
      )
    : [];

  return (
    <section aria-label="Historial dental" className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Historial</h3>
          <p className="text-sm text-muted" aria-live="polite">
            {readLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {at ? (
            <Button variant="clinicalSecondary" onClick={() => onSelectDay(null)}>
              Volver al estado actual
            </Button>
          ) : null}
          <Button variant="clinicalSecondary" onClick={onLeave}>
            Ir a Diagnóstico
          </Button>
        </div>
      </header>
      <p className="text-sm text-muted">Según el historial disponible. Solo lectura.</p>
      {!chart && reads.chartLoading ? <p role="status">Cargando historial…</p> : null}
      {problems ? (
        <div role="alert" className="space-y-2 rounded border border-border bg-surface p-3 text-sm">
          {reads.stale ? (
            <div className="flex flex-wrap items-center gap-2">
              <p>El historial cambió mientras lo leíamos. Este es el último resultado completo.</p>
              <Button variant="clinicalSecondary" onClick={reads.refresh}>
                Actualizar historial
              </Button>
            </div>
          ) : null}
          {reads.invalidSelection ? (
            <div className="flex flex-wrap items-center gap-2">
              <p>La fecha solicitada no es válida para el historial.</p>
              <Button variant="clinicalSecondary" onClick={() => onSelectDay(null)}>
                Volver al estado actual
              </Button>
            </div>
          ) : null}
          {reads.chartFailed ? (
            <div className="flex flex-wrap items-center gap-2">
              <p>No pudimos cargar el odontograma histórico.</p>
              <Button variant="clinicalSecondary" onClick={reads.retryChart}>
                Reintentar
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {chart?.coverage.state === 'partial' ? (
        <p role="status" className="text-sm">
          Cobertura parcial: {coverageWarnings.join('; ')}.
          {chart.coverage.earliest_recorded_at
            ? ` Evidencia registrada desde el ${formatClinicalDateShort(chart.coverage.earliest_recorded_at)}.`
            : ''}
        </p>
      ) : null}
      {chart ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted">Registros</dt>
            <dd>{chart.counts.records}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">Hallazgos</dt>
            <dd>{chart.counts.findings}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">Procedimientos</dt>
            <dd>{chart.counts.procedures}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">En el odontograma</dt>
            <dd>{chart.counts.charted_records}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">Piezas afectadas</dt>
            <dd>{chart.counts.affected_teeth}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">Arcadas afectadas</dt>
            <dd>{chart.counts.affected_arches}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">Registros eliminados</dt>
            <dd>{chart.counts.deleted_records}</dd>
          </div>
        </dl>
      ) : null}
      <DentalHistoryTimeline
        dates={loadedDates}
        selectedDay={at}
        onSelectDay={onSelectDay}
        hasMore={!!reads.events.nextCursor}
        loadingOlder={reads.events.loading}
        onLoadOlder={reads.loadOlderEvents}
        loadedEvents={reads.events.items.length}
        totalEvents={reads.events.total}
      />
      {empty ? (
        <EmptyState
          headingLevel={3}
          title="Sin historial dental registrado"
          description={
            at
              ? `No hay condiciones ni procedimientos guardados hasta el ${formatClinicalDayShort(at)}.`
              : 'No hay condiciones ni procedimientos guardados en esta dentición.'
          }
        />
      ) : chart ? (
        <PatientOdontogram
          dentition={dentition}
          conditions={conditions}
          treatments={treatments}
          treatmentCatalog={reads.treatmentCatalog}
          labels={labels}
          catalog={reads.catalog}
          selectedTooth={inspection?.tooth ?? 0}
          highlightedTooth={highlightedTooth}
          onSelect={(tooth, anchor) => {
            if (anchor) setInspection({ tooth, anchor });
          }}
          onHighlight={setHighlightedTooth}
          complete={chart.coverage.state === 'complete'}
          controls={
            <div className="flex gap-2" aria-label="Dentición">
              {(['permanent', 'primary'] as const).map((mode) => (
                <Button
                  key={mode}
                  variant="clinicalSecondary"
                  aria-pressed={dentition === mode}
                  disabled={reads.chartLoading}
                  onClick={() => {
                    if (mode !== dentition) onSelectDentition(mode);
                  }}
                >
                  {mode === 'permanent' ? 'Permanente' : 'Temporal'}
                </Button>
              ))}
            </div>
          }
        />
      ) : null}
      {at ? (
        <HistoryEventList
          heading={`Cambios del ${formatClinicalDayShort(at)}`}
          loadedLabel={`Eventos del día: ${reads.dayEvents.items.length} de ${reads.dayEvents.total}`}
          emptyMessage="Sin cambios registrados ese día."
          failureMessage="No pudimos cargar los cambios del día."
          events={reads.dayEvents}
          loading={reads.dayEvents.loading}
          pagination={{ label: 'Ver más cambios del día', onLoadMore: reads.loadMoreDayEvents }}
          onRetry={reads.retryDayEvents}
          labels={labels}
          catalog={reads.catalog}
        />
      ) : null}
      <HistoryEventList
        heading="Eventos registrados"
        loadedLabel={`Eventos cargados: ${reads.events.items.length} de ${reads.events.total}`}
        emptyMessage="Sin eventos registrados en el historial cargado."
        failureMessage="No pudimos cargar las fechas del historial."
        events={reads.events}
        loading={reads.events.loading}
        onRetry={reads.retryEvents}
        labels={labels}
        catalog={reads.catalog}
      />
      {inspection ? (
        <ToothInspectionPopover
          tooth={inspection.tooth}
          anchor={inspection.anchor}
          onClose={() => setInspection(null)}
        >
          <p className="mt-2 text-sm text-muted">
            {toothFamilyLabels[toothFamily(inspection.tooth)]} ·{' '}
            {dentition === 'permanent' ? 'Permanente' : 'Temporal'}
          </p>
          {toothConditions.length === 0 && toothTreatments.length === 0 ? (
            <p className="text-sm">Sin registros históricos en esta pieza.</p>
          ) : null}
          {toothConditions.map((item) => {
            const snapshot = item.snapshot as ConditionSnapshot;
            return (
              <div key={item.resource_id} className="mt-2 border-t border-border pt-2 text-sm">
                <p>
                  {labels[snapshot.condition_code] ??
                    resolveCondition(reads.catalog, snapshot.condition_code).label}{' '}
                  · {conditionStatusLabels[snapshot.status]}
                </p>
                <p>
                  {surfaceDescription(reads.catalog, snapshot.condition_code, snapshot.surfaces)}
                </p>
                {snapshot.note ? (
                  <p className="whitespace-pre-wrap break-words">{snapshot.note}</p>
                ) : null}
                <p className="text-xs text-muted">
                  Revisión {item.revision} · {formatClinicalDateShort(item.changed_at)}{' '}
                  {formatClinicalTime(item.changed_at)}
                </p>
                <PatientActorLabel
                  actor={actorFor('condition', item.resource_id, item.revision)}
                  compact
                />
              </div>
            );
          })}
          {toothTreatments.map((item) => {
            const snapshot = item.snapshot as PatientTreatment;
            const member = snapshot.teeth.find(
              (candidate) => candidate.tooth_fdi === inspection.tooth,
            );
            return (
              <div key={item.resource_id} className="mt-2 border-t border-border pt-2 text-sm">
                <p>
                  {snapshot.label_es} · {treatmentStateLabel(snapshot.state)}
                </p>
                <p>
                  {member?.role === 'pillar'
                    ? 'Pilar'
                    : member?.role === 'pontic'
                      ? 'Póntico'
                      : 'Pieza completa'}{' '}
                  ·{' '}
                  {member?.surfaces.length
                    ? member.surfaces.join(', ')
                    : 'Sin superficies especificadas'}
                </p>
                {snapshot.note ? (
                  <p className="whitespace-pre-wrap break-words">{snapshot.note}</p>
                ) : null}
                <p className="text-xs text-muted">
                  Revisión {item.revision} · {formatClinicalDateShort(item.changed_at)}{' '}
                  {formatClinicalTime(item.changed_at)}
                </p>
                <PatientActorLabel
                  actor={actorFor('procedure', item.resource_id, item.revision)}
                  compact
                />
              </div>
            );
          })}
        </ToothInspectionPopover>
      ) : null}
    </section>
  );
}

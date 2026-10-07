import { useEffect, useRef, useState } from 'react';
import { useDentalClinicalNotes } from '../../hooks/useDentalClinicalNotes';
import {
  planActionLabels,
  planStateLabels,
  usePatientClinicalPlan,
} from '../../hooks/usePatientClinicalPlan';
import { useOptionalTransitionGuard } from '../../hooks/useTransitionGuard';
import type { ClinicalPlanStage } from '../../lib/api';
import { ConfirmDialog } from '../ConfirmDialog';
import { Button } from '../ui/Button';
import { ClinicalPlanCorrection } from './ClinicalPlanCorrection';
import { ClinicalPlanExecution } from './ClinicalPlanExecution';
import { ClinicalPlanItemComposer } from './ClinicalPlanItemComposer';
import { ClinicalPlanLifecycle, closureLabels } from './ClinicalPlanLifecycle';
import { ClinicalPlanStageEditor } from './ClinicalPlanStageEditor';
import { DentalClinicalNotes } from './DentalClinicalNotes';
import { PatientActorLabel } from './PatientActorLabel';

interface PatientClinicalPlansProps {
  patientId: string;
  mode?: 'planning' | 'plans';
}
export function PatientClinicalPlans({
  patientId,
  mode = 'planning',
}: PatientClinicalPlansProps): JSX.Element {
  const workspace = usePatientClinicalPlan(patientId);
  const clinicalNotes = useDentalClinicalNotes(patientId, {
    note_type: 'treatment_plan',
    entity_kind: 'plan',
    entity_id: workspace.plan?.id ?? patientId,
  });
  const guard = useOptionalTransitionGuard();
  const [title, setTitle] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [dirty, setDirty] = useState(false);
  const [lifecycleDirty, setLifecycleDirty] = useState(false);
  const [executionDirty, setExecutionDirty] = useState(false);
  const [editingMetadata, setEditingMetadata] = useState(false);
  const [stageEditor, setStageEditor] = useState<{
    itemId: string;
    stage?: ClinicalPlanStage;
  } | null>(null);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const draftFormRef = useRef<HTMLFormElement>(null);
  const savedContinuation = useRef<(() => void) | null>(null);
  const current = useRef({
    dirty: dirty || lifecycleDirty || executionDirty || clinicalNotes.dirty,
    busy: workspace.busy || clinicalNotes.busy,
    uncertain: workspace.uncertain,
  });
  current.current = {
    dirty: dirty || lifecycleDirty || executionDirty || clinicalNotes.dirty,
    busy: workspace.busy || clinicalNotes.busy,
    uncertain: workspace.uncertain,
  };
  useEffect(() => {
    if (!workspace.commits) return;
    setDirty(false);
    setLifecycleDirty(false);
    setExecutionDirty(false);
    setEditingMetadata(false);
    setStageEditor(null);
    setTitle('');
    setDiagnosis('');
    setNotes('');
    if (savedContinuation.current) {
      const continuation = savedContinuation.current;
      savedContinuation.current = null;
      setLeave(null);
      continuation();
    }
  }, [workspace.commits]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (current.current.dirty || current.current.busy || current.current.uncertain) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    const remove = guard?.registerBlocker((continuation) => {
      if (!current.current.dirty && !current.current.busy && !current.current.uncertain)
        return false;
      setLeave(() => continuation);
      return true;
    });
    return () => {
      remove?.();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [guard]);
  const transition = (continuation: () => void): void => {
    if (
      dirty ||
      lifecycleDirty ||
      executionDirty ||
      clinicalNotes.dirty ||
      workspace.busy ||
      workspace.uncertain
    )
      setLeave(() => continuation);
    else continuation();
  };
  const metadata = {
    title: title.trim() || null,
    diagnosis: diagnosis.trim() || null,
    internal_notes: notes.trim() || null,
  };
  const metadataForm = (
    <form
      ref={draftFormRef}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void (workspace.plan ? workspace.edit(metadata) : workspace.create(metadata)).then(
          (saved) => {
            if (saved) {
              setDirty(false);
              setEditingMetadata(false);
              setTitle('');
              setDiagnosis('');
              setNotes('');
            }
          },
        );
      }}
    >
      <fieldset
        disabled={
          workspace.busy || workspace.uncertain || (!!workspace.plan && !workspace.editable)
        }
        className="space-y-3"
      >
        <label className="block text-sm">
          Título del plan
          <input
            maxLength={200}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setDirty(true);
            }}
            className="mt-1 block w-full rounded border border-border bg-surface p-2"
          />
        </label>
        <label className="block text-sm">
          Diagnóstico del plan
          <textarea
            maxLength={2000}
            value={diagnosis}
            onChange={(event) => {
              setDiagnosis(event.target.value);
              setDirty(true);
            }}
            className="mt-1 block w-full rounded border border-border bg-surface p-2"
          />
        </label>
        <label className="block text-sm">
          Notas internas
          <textarea
            maxLength={2000}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              setDirty(true);
            }}
            className="mt-1 block w-full rounded border border-border bg-surface p-2"
          />
        </label>
        <Button variant="clinical" type="submit" disabled={workspace.busy || workspace.uncertain}>
          {workspace.plan ? 'Guardar plan' : 'Crear borrador'}
        </Button>
      </fieldset>
    </form>
  );
  const plan = workspace.plan;
  return (
    <section
      aria-label="Planes clínicos"
      className="space-y-5 text-foreground"
      aria-busy={workspace.busy}
    >
      {workspace.error && (
        <div role="alert" className="space-y-2 text-error">
          <p>{workspace.error}</p>
          <div className="flex flex-wrap gap-2">
            {workspace.uncertain ? (
              <>
                <Button
                  variant="clinicalSecondary"
                  disabled={workspace.busy}
                  onClick={() => void workspace.run()}
                >
                  Reintentar misma operación
                </Button>
                <Button
                  variant="clinicalSecondary"
                  disabled={workspace.busy}
                  onClick={workspace.discard}
                >
                  {workspace.latest ? 'Revisar versión guardada' : 'Descartar operación'}
                </Button>
              </>
            ) : (
              <Button variant="clinicalSecondary" onClick={() => void workspace.load()}>
                Reintentar carga
              </Button>
            )}
          </div>
        </div>
      )}
      {workspace.loading && <p role="status">Cargando planes</p>}
      {!plan ? (
        <>
          <h2 className="text-lg font-semibold">{mode === 'plans' ? 'Planes' : 'Planificación'}</h2>
          <p className="text-sm text-muted">
            Los procedimientos futuros pertenecen a un plan; no son observaciones existentes.
          </p>
          {metadataForm}
          <h3 className="font-semibold">Planes guardados</h3>
          {!workspace.loading && !workspace.error && !workspace.plans.length && (
            <p>No hay planes clínicos</p>
          )}
          <ul className="divide-y divide-border">
            {workspace.plans.map((p) => (
              <li key={p.id}>
                <Button
                  variant="clinicalSecondary"
                  onClick={() =>
                    transition(() => {
                      setDirty(false);
                      void workspace.open(p.id);
                    })
                  }
                >
                  {p.title || 'Plan sin título'} · {planStateLabels[p.state]}
                </Button>
              </li>
            ))}
          </ul>
          {workspace.cursor && (
            <Button
              variant="clinicalSecondary"
              onClick={() => void workspace.load(workspace.cursor ?? undefined)}
            >
              Cargar más planes
            </Button>
          )}
        </>
      ) : (
        <>
          <Button
            variant="clinicalSecondary"
            onClick={() =>
              transition(() => {
                workspace.back();
                setDirty(false);
                setStageEditor(null);
                setEditingMetadata(false);
              })
            }
          >
            Volver a planes
          </Button>
          <header className="space-y-2">
            <h2 className="text-lg font-semibold">{plan.title || 'Plan sin título'}</h2>
            <p role="status">
              {planStateLabels[plan.state]} · Revisión {plan.revision}
            </p>
            <p role="status">
              {plan.items.filter((item) => item.status === 'completed').length}/{plan.items.length}{' '}
              procedimientos completados
            </p>
            {plan.state === 'completed' && (
              <p role="status">
                Plan completado automáticamente. Las sesiones realizadas se conservan.
              </p>
            )}
            {plan.items.some((item) => item.status === 'cancelled') && (
              <p className="text-sm text-muted">
                Los procedimientos cancelados siguen en el total; no cuentan como trabajo
                completado. Puedes cerrar el plan con un motivo.
              </p>
            )}
            <p className="whitespace-pre-wrap">{plan.diagnosis}</p>
            <p className="whitespace-pre-wrap text-sm text-muted">{plan.internal_notes}</p>
          </header>
          {!workspace.editable && <p>Plan de solo lectura. Su historial se conserva.</p>}
          <ClinicalPlanLifecycle
            key={`lifecycle-${plan.id}-${workspace.commits}`}
            plan={plan}
            actions={workspace.actions}
            blocked={dirty || executionDirty || workspace.uncertain}
            busy={workspace.busy}
            onDirty={setLifecycleDirty}
            onTransition={workspace.transition}
          />
          {workspace.editable && (
            <Button
              variant="clinicalSecondary"
              disabled={
                dirty || lifecycleDirty || executionDirty || workspace.busy || workspace.uncertain
              }
              onClick={() => {
                setTitle(plan.title ?? '');
                setDiagnosis(plan.diagnosis ?? '');
                setNotes(plan.internal_notes ?? '');
                setEditingMetadata(true);
              }}
            >
              Editar datos del plan
            </Button>
          )}
          {editingMetadata && metadataForm}
          <ol className="space-y-4">
            {plan.items.map((item, index) => (
              <li key={item.id} className="border-t border-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">
                    {index + 1}. {item.treatment.label_es}
                  </h3>
                  <span className="text-sm text-muted">
                    {item.status === 'pending'
                      ? 'Planificado'
                      : item.status === 'completed'
                        ? 'Completado'
                        : 'Cancelado'}
                  </span>
                </div>
                <p className="text-sm">
                  {item.treatment.arch
                    ? `Arcada ${item.treatment.arch === 'upper' ? 'superior' : 'inferior'}`
                    : item.treatment.teeth
                        .map(
                          (m) =>
                            `${m.tooth_fdi}${m.role !== 'tooth' ? ` (${m.role === 'pillar' ? 'pilar' : 'póntico'})` : ''}${m.surfaces.length ? `: ${m.surfaces.join('/')}` : ''}`,
                        )
                        .join(', ')}
                </p>
                <p className="whitespace-pre-wrap text-sm text-muted">{item.treatment.note}</p>
                <ClinicalPlanExecution
                  key={`execution-${item.id}-${workspace.commits}`}
                  item={item}
                  planTitle={plan.title || 'Plan sin título'}
                  active={plan.state === 'active'}
                  editable={
                    workspace.editable &&
                    item.status === 'pending' &&
                    item.treatment.state === 'planned'
                  }
                  blocked={dirty || lifecycleDirty || executionDirty || workspace.uncertain}
                  busy={workspace.busy}
                  uncertain={workspace.uncertain}
                  onDirty={setExecutionDirty}
                  onEdit={(stage) => setStageEditor({ itemId: item.id, stage })}
                  onExecute={workspace.executeStage}
                />
                <ClinicalPlanCorrection
                  key={`correction-${item.id}-${workspace.commits}`}
                  item={item}
                  planTitle={plan.title || 'Plan sin título'}
                  blocked={dirty || lifecycleDirty || executionDirty || workspace.uncertain}
                  busy={workspace.busy}
                  uncertain={workspace.uncertain}
                  onDirty={setExecutionDirty}
                  onCorrect={workspace.correct}
                />
                {workspace.editable && item.status === 'pending' && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="clinicalSecondary"
                      disabled={
                        dirty ||
                        lifecycleDirty ||
                        executionDirty ||
                        workspace.busy ||
                        workspace.uncertain
                      }
                      onClick={() => setStageEditor({ itemId: item.id })}
                    >
                      Añadir sesión
                    </Button>
                    <Button
                      variant="clinicalSecondary"
                      disabled={
                        index === 0 ||
                        dirty ||
                        lifecycleDirty ||
                        executionDirty ||
                        workspace.busy ||
                        workspace.uncertain
                      }
                      onClick={() => {
                        const ids = plan.items.map((i) => i.id);
                        [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                        void workspace.reorder(ids);
                      }}
                    >
                      Subir procedimiento {index + 1}
                    </Button>
                  </div>
                )}
                {stageEditor?.itemId === item.id && (
                  <ClinicalPlanStageEditor
                    formRef={draftFormRef}
                    key={stageEditor.stage?.id ?? 'new'}
                    stage={stageEditor.stage}
                    busy={workspace.busy || workspace.uncertain || !workspace.editable}
                    onDirty={setDirty}
                    onCancel={() => setStageEditor(null)}
                    onSave={(value) => workspace.stage(item.id, value, stageEditor.stage?.id)}
                  />
                )}
              </li>
            ))}
          </ol>
          {(workspace.editable || dirty) &&
            workspace.catalog &&
            !editingMetadata &&
            !stageEditor &&
            !lifecycleDirty &&
            !executionDirty && (
              <ClinicalPlanItemComposer
                formRef={draftFormRef}
                key={`composer-${plan.id}-${workspace.commits}`}
                catalog={workspace.catalog}
                treatments={plan.items.map((item) => item.treatment)}
                busy={workspace.busy || workspace.uncertain || !workspace.editable}
                onDirty={setDirty}
                onSave={workspace.add}
              />
            )}
          <Button variant="clinicalSecondary" onClick={() => void workspace.loadHistory()}>
            Historial del plan
          </Button>
          {workspace.history && (
            <ol className="space-y-2">
              {workspace.history.map((entry) => (
                <li key={entry.id}>
                  Revisión {entry.revision} ·{' '}
                  {planActionLabels[entry.action as keyof typeof planActionLabels] ??
                    (
                      {
                        create: 'Crear borrador',
                        edit: 'Editar plan',
                        add_item: 'Añadir procedimiento',
                        reorder: 'Ordenar procedimientos',
                        add_stage: 'Añadir sesión',
                        edit_stage: 'Editar sesión',
                        edit_item: 'Editar procedimiento',
                        complete_stage: 'Completar sesión',
                        cancel_stage: 'Cancelar sesión',
                        correct_treatment: 'Corregir procedimiento',
                      } as Record<string, string>
                    )[entry.action] ??
                    'Cambio clínico'}{' '}
                  · {new Date(entry.changed_at).toLocaleString('es-CL')} ·
                  <PatientActorLabel actor={entry.actor} />
                  {entry.reason &&
                    ` · ${closureLabels[entry.reason as keyof typeof closureLabels] ?? entry.reason}`}
                  {entry.action === 'accept' && entry.after.acceptance_note && (
                    <p className="whitespace-pre-wrap text-sm text-muted">
                      Aceptación: {entry.after.acceptance_note}
                    </p>
                  )}
                  {entry.action === 'close' && entry.after.closure_note && (
                    <p className="whitespace-pre-wrap text-sm text-muted">
                      Cierre: {entry.after.closure_note}
                    </p>
                  )}
                  {(entry.action === 'complete_stage' ||
                    entry.action === 'cancel_stage' ||
                    entry.action === 'correct_treatment') && (
                    <ul className="ml-4 text-sm text-muted">
                      {entry.after.items
                        .filter((item) => {
                          const prior = entry.before?.items.find((i) => i.id === item.id);
                          return !prior || item.treatment.revision !== prior.treatment.revision;
                        })
                        .map((item) => (
                          <li key={item.id}>
                            {item.treatment.label_es}:{' '}
                            {item.stages
                              .map(
                                (stage) =>
                                  `${stage.label} (${stage.status === 'completed' ? 'Completada' : stage.status === 'cancelled' ? 'Cancelada' : 'Pendiente'})`,
                              )
                              .join(', ')}
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
          {workspace.historyCursor && (
            <Button
              variant="clinicalSecondary"
              onClick={() => void workspace.loadHistory(workspace.historyCursor ?? undefined)}
            >
              Cargar más historial
            </Button>
          )}
        </>
      )}
      {plan && <DentalClinicalNotes notes={clinicalNotes} hideSaveIndicator={!!leave} />}
      {leave && (
        <ConfirmDialog
          title="Cambios sin guardar"
          description="El borrador de este plan no se ha guardado. Guarda, descarta o permanece para revisarlo antes de cambiar de contexto."
          confirmLabel="Descartar y continuar"
          cancelLabel="Permanecer"
          busy={workspace.busy || clinicalNotes.busy}
          error={navigationError ?? workspace.error}
          secondaryLabel={
            !lifecycleDirty &&
            !executionDirty &&
            (dirty || workspace.uncertain || clinicalNotes.dirty)
              ? 'Guardar y continuar'
              : undefined
          }
          onSecondary={() => {
            if (clinicalNotes.dirty) {
              void clinicalNotes.save().then((saved) => {
                if (saved) {
                  const continuation = leave;
                  setLeave(null);
                  guard?.cancelTransition();
                  if (dirty || lifecycleDirty || executionDirty || workspace.uncertain)
                    setLeave(() => continuation);
                  else window.requestAnimationFrame(continuation);
                }
              });
              return;
            }
            setNavigationError(null);
            if (
              !workspace.uncertain &&
              (!draftFormRef.current || !draftFormRef.current.checkValidity())
            ) {
              setNavigationError(
                'Completa el procedimiento y las sesiones. Permanece para revisar los campos.',
              );
              return;
            }
            savedContinuation.current = leave;
            if (workspace.uncertain) void workspace.run();
            else draftFormRef.current?.requestSubmit();
          }}
          onCancel={() => {
            savedContinuation.current = null;
            setNavigationError(null);
            setLeave(null);
            guard?.cancelTransition();
          }}
          onConfirm={() => {
            savedContinuation.current = null;
            setNavigationError(null);
            const continuation = leave;
            workspace.discard();
            clinicalNotes.cancel();
            setDirty(false);
            setLifecycleDirty(false);
            setExecutionDirty(false);
            setLeave(null);
            continuation();
          }}
        />
      )}
    </section>
  );
}

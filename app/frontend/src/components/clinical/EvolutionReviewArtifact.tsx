import { ChevronDown, CircleAlert, Pencil } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useAutosizeTextarea } from '../../hooks/useAutosizeTextarea';
import type { ClinicalDraft, ClinicalPatient } from '../../lib/api';
import {
  formatClinicalDate,
  formatClinicalDateShort,
  formatClinicalDateTime,
  formatClinicalTime,
  parseClinicalDateInput,
  parseClinicalDateTimeInput,
} from '../../lib/clinicalDate';
import { type ArtifactEditBuffer, useClinicalComposerMemory } from '../ClinicalRuntimeProvider';
import { Spinner } from '../Spinner';
import { ClinicalDateField } from '../patterns/ClinicalDateField';
import { clinicalFields, hasClinicalContent } from './evolutionFields';

export type ClinicalArtifactStage = 'draft' | 'review' | 'saving' | 'saved';

const lifecycleStageLabels: Record<ClinicalArtifactStage, string> = {
  draft: 'Borrador',
  review: 'Revisión',
  saving: 'Guardando…',
  saved: 'Guardada en ficha',
};

interface EvolutionReviewArtifactProps {
  mode: 'assistant' | 'manual';
  threadId?: string;
  artifactId?: string;
  sourceNote: string;
  patient?: ClinicalPatient | null;
  draft: ClinicalDraft;
  generatedDraft: ClinicalDraft | null;
  evolutionAt: string;
  stale: boolean;
  edited: boolean;
  readOnly?: boolean;
  sourceEditable?: boolean;
  showSource?: boolean;
  showDateTime?: boolean;
  canSave?: boolean;
  saving?: boolean;
  preparing?: boolean;
  onChange: (draft: ClinicalDraft) => void;
  onSourceChange?: (sourceNote: string) => unknown;
  onEvolutionAtChange?: (evolutionAt: string) => void;
  onRegenerate?: () => void;
  onPrepare?: () => void;
  onSave?: () => void;
  embedded?: boolean;
  lifecycleLabel?: string;
  lifecycleStage?: ClinicalArtifactStage;
  showAssistantActions?: boolean;
  staleMessageId?: string;
  syncState?: 'idle' | 'saving' | 'saved' | 'error';
  onRetrySync?: () => void;
  footerAccessory?: ReactNode;
}

type ClinicalFieldKey = (typeof clinicalFields)[number]['key'];

export function EvolutionReviewArtifact({
  mode,
  threadId,
  artifactId,
  sourceNote,
  patient,
  draft,
  evolutionAt,
  stale,
  edited,
  readOnly = false,
  sourceEditable = false,
  showSource = true,
  showDateTime = false,
  canSave = false,
  saving = false,
  preparing = false,
  onChange,
  onSourceChange,
  onEvolutionAtChange,
  onRegenerate,
  onPrepare,
  onSave,
  embedded = false,
  lifecycleLabel,
  lifecycleStage,
  showAssistantActions = true,
  staleMessageId,
  syncState = 'idle',
  onRetrySync,
  footerAccessory,
}: EvolutionReviewArtifactProps) {
  const [editingSource, setEditingSource] = useState(false);
  const [sourceEditingValue, setSourceEditingValue] = useState(sourceNote);
  const [sourceSaveState, setSourceSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [editingField, setEditingField] = useState<ClinicalFieldKey | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [dateControls, setDateControls] = useState(showDateTime);
  const [dateInput, setDateInput] = useState(() => formatClinicalDate(evolutionAt));
  const [timeInput, setTimeInput] = useState(() => formatClinicalTime(evolutionAt));
  const dateFirstInputRef = useRef<HTMLInputElement>(null);
  const dateEditButtonRef = useRef<HTMLButtonElement>(null);
  const dateControlsRef = useRef(dateControls);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [flagsOpen, setFlagsOpen] = useState(draft.review_flags.length === 1);
  const flagsPanelId = useId();
  const fieldEditButtonRefs = useRef<Partial<Record<ClinicalFieldKey, HTMLButtonElement | null>>>(
    {},
  );
  const fieldTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fieldsId = useId();
  const longContent =
    clinicalFields.reduce((total, { key }) => total + draft[key].length, 0) > 3000;
  useAutosizeTextarea({
    ref: fieldTextareaRef,
    value: `${editingField ?? ''}:${editingValue}`,
    maxHeight: 480,
  });
  const returnFocusFieldRef = useRef<ClinicalFieldKey | null>(null);
  const isAssistant = mode === 'assistant';
  const emptyDraft = !hasClinicalContent(draft);
  const visibleStage = lifecycleStage ?? 'draft';
  const assistantLifecycle =
    lifecycleLabel ??
    (stale && visibleStage === 'draft'
      ? 'Necesita regeneración'
      : lifecycleStageLabels[visibleStage]);
  const showActions = !embedded || !isAssistant || showAssistantActions;
  const Root = embedded ? ('div' as const) : ('article' as const);
  const dateValid = parseClinicalDateInput(dateInput) !== null;
  const timeValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(timeInput);
  const openDateControls = () => {
    if (dateControls) {
      setDateControls(false);
      return;
    }
    setDateInput(formatClinicalDate(evolutionAt));
    setTimeInput(formatClinicalTime(evolutionAt));
    setDateControls(true);
  };
  const closeDateControls = () => {
    setDateControls(false);
    window.requestAnimationFrame(() => dateEditButtonRef.current?.focus());
  };
  const applyDate = () => {
    const next = parseClinicalDateTimeInput(dateInput, timeInput);
    if (!next || !onEvolutionAtChange) return;
    onEvolutionAtChange(next.toISOString());
    closeDateControls();
  };
  const memory = useClinicalComposerMemory();
  const bufferKey = (target: string): string | null =>
    threadId && artifactId ? `${threadId}:${artifactId}:${target}` : null;
  const readBuffer = (target: string): ArtifactEditBuffer | undefined => {
    const key = bufferKey(target);
    return key ? memory?.artifactBuffers[key] : undefined;
  };
  const writeBuffer = (target: string, value: string, editing: boolean, applied: boolean) => {
    const key = bufferKey(target);
    if (!key || !memory) return;
    const baseline = memory.artifactBuffers[key]?.baseline ?? value;
    memory.setArtifactBuffer(key, { value, baseline, editing, applied });
  };
  const clearBuffer = (target: string) => {
    const key = bufferKey(target);
    if (key) memory?.setArtifactBuffer(key, null);
  };

  const restoredBuffersRef = useRef<string | null>(null);
  useEffect(() => {
    if (!threadId || !artifactId || !memory) return;
    const identity = `${threadId}:${artifactId}`;
    if (restoredBuffersRef.current === identity) return;
    restoredBuffersRef.current = identity;
    for (const { key } of clinicalFields) {
      const buffer = memory.artifactBuffers[`${identity}:field:${key}`];
      if (!buffer?.editing) continue;
      setEditingField(key);
      setEditingValue(buffer.value);
      break;
    }
    const sourceBuffer = memory.artifactBuffers[`${identity}:source`];
    if (sourceBuffer?.editing) {
      setSourceEditingValue(sourceBuffer.value);
      setSourceOpen(true);
      setEditingSource(true);
    }
  }, [artifactId, memory, threadId]);

  // ponytail: clear an applied buffer only when its own sync reports success.
  const previousSyncStateRef = useRef<'idle' | 'saving' | 'saved' | 'error'>('idle');
  useEffect(() => {
    const previous = previousSyncStateRef.current;
    previousSyncStateRef.current = syncState;
    if (syncState !== 'saved' || previous === 'saved' || !threadId || !artifactId || !memory)
      return;
    const identity = `${threadId}:${artifactId}`;
    for (const target of ['source', ...clinicalFields.map(({ key }) => `field:${key}`)]) {
      const key = `${identity}:${target}`;
      if (memory.artifactBuffers[key]?.applied) memory.setArtifactBuffer(key, null);
    }
  }, [artifactId, memory, syncState, threadId]);

  const startFieldEdit = (key: ClinicalFieldKey) => {
    const value = readBuffer(`field:${key}`)?.value ?? draft[key];
    setEditingField(key);
    setEditingValue(value);
    writeBuffer(`field:${key}`, value, true, false);
  };
  const closeFieldEdit = () => {
    returnFocusFieldRef.current = editingField;
    setEditingField(null);
    setEditingValue('');
  };
  const cancelFieldEdit = () => {
    if (editingField) clearBuffer(`field:${editingField}`);
    closeFieldEdit();
  };
  const applyFieldEdit = () => {
    if (!editingField) return;
    const field = editingField;
    writeBuffer(`field:${field}`, editingValue, false, true);
    onChange({ ...draft, [field]: editingValue });
    closeFieldEdit();
  };

  useEffect(() => {
    if (editingField) {
      fieldTextareaRef.current?.focus();
      return;
    }
    const field = returnFocusFieldRef.current;
    if (!field) return;
    returnFocusFieldRef.current = null;
    fieldEditButtonRefs.current[field]?.focus();
  }, [editingField]);

  useEffect(() => {
    if (dateControls && !dateControlsRef.current) dateFirstInputRef.current?.focus();
    dateControlsRef.current = dateControls;
  }, [dateControls]);
  const startSourceEdit = () => {
    const value = readBuffer('source')?.value ?? sourceNote;
    setSourceEditingValue(value);
    setSourceSaveState('idle');
    setEditingSource(true);
    writeBuffer('source', value, true, false);
  };
  const cancelSourceEdit = () => {
    clearBuffer('source');
    setSourceEditingValue(sourceNote);
    setSourceSaveState('idle');
    setEditingSource(false);
  };
  const applySourceEdit = async () => {
    if (!onSourceChange) return;
    setSourceSaveState('saving');
    const result = await onSourceChange(sourceEditingValue);
    if (result === false) {
      setSourceSaveState('error');
      return;
    }
    clearBuffer('source');
    setSourceSaveState('saved');
    setEditingSource(false);
  };

  return (
    <Root
      className={
        embedded
          ? 'clinical-artifact-content'
          : isAssistant
            ? 'clinical-artifact'
            : 'evolution-review-artifact'
      }
      data-assistant-label={isAssistant ? 'Borrador asistido' : undefined}
      aria-label={embedded ? undefined : isAssistant ? 'Evolución clínica' : 'Evolución propuesta'}
    >
      <div
        className={isAssistant ? 'clinical-artifact-heading' : 'evolution-review-artifact__heading'}
      >
        <div className={isAssistant ? 'clinical-artifact-heading__copy' : undefined}>
          <h3>{isAssistant ? 'Evolución clínica' : 'Borrador para revisar'}</h3>
          <div className="clinical-artifact-metadata">
            {isAssistant && patient && (
              <>
                <span>
                  {patient.first_name} {patient.last_name}
                </span>
                <span aria-hidden="true">·</span>
                <span>{patient.rut_masked}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <time dateTime={evolutionAt}>
              {isAssistant
                ? formatClinicalDateShort(evolutionAt)
                : formatClinicalDateTime(evolutionAt)}
            </time>
            {onEvolutionAtChange && !readOnly && (
              <button
                ref={dateEditButtonRef}
                type="button"
                aria-label="Cambiar fecha y hora"
                title="Cambiar fecha y hora"
                aria-expanded={dateControls}
                onClick={openDateControls}
              >
                <Pencil aria-hidden="true" size={14} />
              </button>
            )}
          </div>
        </div>
        {isAssistant && (
          <div className="clinical-artifact-statuses">
            {draft.review_flags.length > 0 && (
              <button
                type="button"
                className="clinical-review-chip"
                aria-expanded={flagsOpen}
                aria-controls={flagsPanelId}
                onClick={() => setFlagsOpen((current) => !current)}
              >
                {visibleStage === 'saved'
                  ? `${draft.review_flags.length} ${draft.review_flags.length === 1 ? 'observación' : 'observaciones'}`
                  : `${draft.review_flags.length} por revisar`}
              </button>
            )}
            <span
              className="clinical-stage-chip"
              data-stage={visibleStage}
              data-lifecycle-label={assistantLifecycle}
              aria-current="step"
              aria-live={visibleStage === 'saving' ? 'polite' : undefined}
            >
              {visibleStage === 'saving' && <Spinner size={14} />}
              {assistantLifecycle}
            </span>
          </div>
        )}
      </div>

      {stale && (
        <p className={isAssistant ? 'clinical-warning' : 'mt-4 text-sm text-warning'}>
          La nota original cambió. Regenera antes de preparar el guardado.
        </p>
      )}

      {dateControls && onEvolutionAtChange && (
        <div
          className="evolution-review-artifact__date-controls"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              closeDateControls();
            }
          }}
        >
          <ClinicalDateField
            label="Fecha de evolución"
            value={dateInput}
            onChange={setDateInput}
            inputRef={dateFirstInputRef}
            shortcuts
            error={dateValid ? null : 'Ingresa una fecha válida, no futura, como dd/mm/aaaa.'}
          />
          <label className="clinical-date-field">
            <span className="clinical-date-field__label">Hora de evolución</span>
            <input
              className="evolution-review-artifact__time-input"
              aria-label="Hora de evolución"
              type="text"
              inputMode="numeric"
              maxLength={5}
              placeholder="HH:mm"
              value={timeInput}
              aria-invalid={!timeValid}
              aria-describedby={!timeValid ? 'assistant-evolution-time-error' : undefined}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
                setTimeInput(
                  digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`,
                );
              }}
            />
            {!timeValid && (
              <span
                id="assistant-evolution-time-error"
                className="clinical-date-field__error"
                role="alert"
              >
                Ingresa una hora válida en formato HH:mm.
              </span>
            )}
          </label>
          <div className="evolution-review-artifact__date-actions">
            <button type="button" onClick={closeDateControls}>
              Cancelar
            </button>
            <button type="button" onClick={applyDate} disabled={!dateValid || !timeValid}>
              Aplicar
            </button>
          </div>
        </div>
      )}

      {showSource && !isAssistant && (
        <div className="evolution-review-artifact__source">
          <span>Nota clínica original</span>
          {editingSource && sourceEditable ? (
            <textarea
              rows={2}
              value={sourceEditingValue}
              onChange={(event) => {
                setSourceEditingValue(event.target.value);
                writeBuffer('source', event.target.value, true, false);
              }}
              disabled={readOnly}
              aria-label="Editar nota clínica original"
            />
          ) : (
            <blockquote>{sourceNote || 'Sin nota fuente disponible.'}</blockquote>
          )}
          {sourceEditable && !readOnly && (
            <button
              type="button"
              className={
                isAssistant ? 'clinical-secondary-button' : 'text-sm text-primary hover:underline'
              }
              onClick={editingSource ? cancelSourceEdit : startSourceEdit}
            >
              {editingSource ? 'Cerrar edición' : 'Editar nota fuente'}
            </button>
          )}
        </div>
      )}

      {longContent && (
        <nav className="evolution-section-nav" aria-label="Secciones de evolución">
          <label>
            <span>Ir a sección</span>
            <select
              value=""
              onChange={(event) => {
                const heading = document.getElementById(`${fieldsId}-${event.target.value}`);
                heading?.scrollIntoView({ block: 'start', behavior: 'auto' });
                heading?.focus({ preventScroll: true });
              }}
            >
              <option value="">Seleccionar sección</option>
              {clinicalFields.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </nav>
      )}
      <div
        className={
          isAssistant
            ? 'clinical-draft-fields clinical-artifact-body'
            : 'evolution-review-artifact__fields'
        }
      >
        {clinicalFields.map(({ key, label }) => (
          <div
            key={key}
            className={
              key === 'context' || key === 'findings' || key === 'assessment'
                ? 'evolution-review-artifact__wide'
                : undefined
            }
          >
            <div className="evolution-review-artifact__field-heading">
              <h4 id={`${fieldsId}-${key}`} tabIndex={-1}>
                {label}
              </h4>
              {!readOnly && editingField !== key && (
                <button
                  ref={(node) => {
                    fieldEditButtonRefs.current[key] = node;
                  }}
                  type="button"
                  className={
                    isAssistant ? 'clinical-field-edit' : 'text-sm text-primary hover:underline'
                  }
                  onClick={() => startFieldEdit(key)}
                  aria-label={`Editar ${label}`}
                  title={`Editar ${label}`}
                >
                  {isAssistant && <Pencil aria-hidden="true" size={14} />}
                  <span>Editar</span>
                </button>
              )}
            </div>
            {editingField === key && !readOnly ? (
              <>
                <textarea
                  ref={fieldTextareaRef}
                  rows={isAssistant ? 2 : 3}
                  value={editingValue}
                  onChange={(event) => {
                    setEditingValue(event.target.value);
                    writeBuffer(`field:${key}`, event.target.value, true, false);
                  }}
                  aria-label={label}
                />
                <div className="evolution-review-artifact__field-actions">
                  <button
                    type="button"
                    className="text-sm text-muted hover:underline"
                    onClick={cancelFieldEdit}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className={
                      isAssistant
                        ? 'clinical-secondary-button'
                        : 'text-sm text-primary hover:underline'
                    }
                    onClick={applyFieldEdit}
                  >
                    Aplicar
                  </button>
                </div>
              </>
            ) : (
              <p
                className="evolution-review-artifact__field-value"
                data-empty={draft[key] ? undefined : true}
              >
                {draft[key] || 'Sin información registrada.'}
              </p>
            )}
          </div>
        ))}
      </div>

      {draft.review_flags.length > 0 && (
        <section
          className={isAssistant ? 'clinical-review-flags' : 'evolution-review-artifact__flags'}
          aria-label="Observaciones de revisión"
          id={isAssistant ? flagsPanelId : undefined}
        >
          <button
            type="button"
            className="clinical-review-flags__toggle"
            aria-expanded={flagsOpen}
            onClick={() => setFlagsOpen((current) => !current)}
          >
            <span className="clinical-review-flags__summary">
              <CircleAlert aria-hidden="true" size={15} strokeWidth={1.8} />
              <span className="clinical-review-flags__copy">
                <strong>
                  {draft.review_flags.length === 1
                    ? 'Observación de revisión'
                    : 'Observaciones de revisión'}
                </strong>
                <small>Información que puede ser útil verificar clínicamente.</small>
              </span>
            </span>
            <span className="clinical-review-flags__meta">
              <span
                aria-label={`${draft.review_flags.length} ${draft.review_flags.length === 1 ? 'observación' : 'observaciones'}`}
              >
                {draft.review_flags.length}
              </span>
              <ChevronDown
                aria-hidden="true"
                size={15}
                className={flagsOpen ? 'is-open' : undefined}
              />
            </span>
          </button>
          {flagsOpen && (
            <div className="clinical-review-flags__content">
              <ul>
                {draft.review_flags.map((flag, index) => (
                  <li key={`${flag.source_text}-${flag.reason}`}>
                    <span className="clinical-review-flags__index">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <q>{flag.source_text}</q>
                      <p>{flag.reason}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="clinical-review-flags__advisory">
                Estas observaciones no impiden guardar la evolución.
              </p>
            </div>
          )}
        </section>
      )}

      {showSource && isAssistant && (
        <div className="clinical-source-note">
          <div className="clinical-provenance-row">
            <span>Fuente · Nota clínica</span>
            <button
              type="button"
              className="clinical-source-note__toggle"
              aria-expanded={sourceOpen}
              onClick={() => setSourceOpen((current) => !current)}
            >
              <ChevronDown aria-hidden="true" size={15} />
              {sourceOpen ? 'Ocultar evidencia' : 'Ver evidencia'}
            </button>
          </div>
          {sourceOpen && (
            <>
              <blockquote>{sourceNote || 'Sin nota fuente disponible.'}</blockquote>
              {sourceEditable && !readOnly && (
                <button
                  type="button"
                  className="clinical-secondary-button"
                  onClick={editingSource ? cancelSourceEdit : startSourceEdit}
                >
                  {editingSource ? 'Cerrar edición' : 'Editar nota original'}
                </button>
              )}
              {editingSource && sourceEditable && !readOnly && (
                <div className="clinical-source-editor">
                  <textarea
                    rows={3}
                    value={sourceEditingValue}
                    onChange={(event) => {
                      setSourceEditingValue(event.target.value);
                      setSourceSaveState('idle');
                      writeBuffer('source', event.target.value, true, false);
                    }}
                    aria-label="Editar nota clínica original"
                  />
                  {sourceSaveState === 'error' && (
                    <div className="clinical-source-error" role="alert">
                      <span>No pudimos guardar estos cambios. Tu texto sigue aquí.</span>
                      <button type="button" onClick={() => void applySourceEdit()}>
                        Reintentar
                      </button>
                    </div>
                  )}
                  <div className="evolution-review-artifact__field-actions">
                    <span role="status" aria-live="polite">
                      {sourceSaveState === 'saving'
                        ? 'Guardando…'
                        : sourceSaveState === 'saved'
                          ? 'Cambios guardados'
                          : sourceEditingValue !== sourceNote
                            ? 'Cambios sin guardar'
                            : ''}
                    </span>
                    <button
                      type="button"
                      className="clinical-secondary-button"
                      onClick={cancelSourceEdit}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="clinical-primary-button"
                      disabled={sourceSaveState === 'saving'}
                      onClick={() => void applySourceEdit()}
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showActions && (
        <div
          className={
            isAssistant ? 'clinical-artifact-actions' : 'evolution-review-artifact__actions'
          }
        >
          {isAssistant && (
            <div className={`clinical-sync-state is-${syncState}`} role="status" aria-live="polite">
              <span>
                {syncState === 'saving'
                  ? 'Guardando cambios…'
                  : syncState === 'error'
                    ? 'No pudimos guardar estos cambios. Tu contenido sigue aquí.'
                    : syncState === 'saved'
                      ? 'Cambios guardados'
                      : edited
                        ? 'Cambios sin guardar'
                        : 'Borrador editable · aún no guardado'}
              </span>
              {syncState === 'error' && onRetrySync && (
                <button type="button" onClick={onRetrySync}>
                  Reintentar
                </button>
              )}
            </div>
          )}
          <div className="clinical-artifact-actions__controls">
            {footerAccessory}
            {!readOnly && stale && onRegenerate ? (
              confirmReplace ? (
                <span className="clinical-regeneration-confirmation">
                  <span>Reemplazar el borrador editado</span>
                  <button
                    type="button"
                    className="clinical-secondary-button"
                    onClick={() => setConfirmReplace(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="clinical-primary-button"
                    disabled={editingField !== null}
                    onClick={() => {
                      setConfirmReplace(false);
                      onRegenerate();
                    }}
                  >
                    Regenerar
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="clinical-secondary-button"
                  disabled={editingField !== null}
                  onClick={() => (edited ? setConfirmReplace(true) : onRegenerate())}
                >
                  Regenerar
                </button>
              )
            ) : !readOnly && onSave ? (
              <button
                type="button"
                disabled={!canSave || saving || editingField !== null}
                onClick={onSave}
                aria-describedby={stale ? staleMessageId : undefined}
                className="rounded-lg bg-action hover:bg-action-hover px-4 py-2 font-medium text-white disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Spinner /> Guardando…
                  </>
                ) : (
                  'Guardar evolución'
                )}
              </button>
            ) : !readOnly && onPrepare ? (
              <button
                type="button"
                className="clinical-primary-button"
                disabled={emptyDraft || editingField !== null || preparing}
                onClick={onPrepare}
              >
                {preparing ? (
                  <>
                    <Spinner /> Preparando…
                  </>
                ) : isAssistant ? (
                  'Revisar y guardar'
                ) : (
                  'Preparar para guardar'
                )}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </Root>
  );
}

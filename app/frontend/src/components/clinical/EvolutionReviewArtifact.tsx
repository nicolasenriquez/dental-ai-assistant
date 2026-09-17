import { ChevronDown, CircleAlert, Pencil } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import type { ClinicalDraft, ClinicalPatient } from '../../lib/api';
import { formatClinicalDateShort, formatClinicalDateTime } from '../../lib/clinicalDate';
import { Spinner } from '../Spinner';
import { clinicalFields, hasClinicalContent } from './evolutionFields';

export type ClinicalArtifactStage = 'draft' | 'review' | 'saving' | 'saved';

const lifecycleStageLabels: Record<ClinicalArtifactStage, string> = {
  draft: 'Borrador',
  review: 'Revisión',
  saving: 'Guardando…',
  saved: 'Guardada',
};

interface EvolutionReviewArtifactProps {
  mode: 'assistant' | 'manual';
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

function dateParts(value: string): { date: string; time: string } {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: '', time: '' };
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  return { date: local.slice(0, 10), time: local.slice(11) };
}

export function EvolutionReviewArtifact({
  mode,
  sourceNote,
  patient,
  draft,
  generatedDraft,
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
  const [sourceOpen, setSourceOpen] = useState(false);
  const [flagsOpen, setFlagsOpen] = useState(draft.review_flags.length === 1);
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
  const parts = dateParts(evolutionAt);
  const updateDate = (date: string, time: string) => {
    if (!date || !time || !onEvolutionAtChange) return;
    const next = new Date(`${date}T${time}`);
    if (!Number.isNaN(next.getTime())) onEvolutionAtChange(next.toISOString());
  };
  const startFieldEdit = (key: ClinicalFieldKey) => {
    setEditingField(key);
    setEditingValue(draft[key]);
  };
  const cancelFieldEdit = () => {
    setEditingField(null);
    setEditingValue('');
  };
  const applyFieldEdit = () => {
    if (!editingField) return;
    onChange({ ...draft, [editingField]: editingValue });
    cancelFieldEdit();
  };
  const startSourceEdit = () => {
    setSourceEditingValue(sourceNote);
    setSourceSaveState('idle');
    setEditingSource(true);
  };
  const cancelSourceEdit = () => {
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
                type="button"
                aria-label="Cambiar fecha y hora"
                title="Cambiar fecha y hora"
                onClick={() => setDateControls((current) => !current)}
              >
                <Pencil aria-hidden="true" size={14} />
              </button>
            )}
          </div>
        </div>
        {isAssistant && (
          <div className="clinical-artifact-statuses">
            {assistantLifecycle !== lifecycleStageLabels[visibleStage] && (
              <span className="clinical-artifact-status">{assistantLifecycle}</span>
            )}
            <ol
              className="clinical-artifact-lifecycle"
              data-stage={visibleStage}
              data-lifecycle-label={assistantLifecycle}
              aria-label="Etapa de la evolución"
              aria-live={visibleStage === 'saving' ? 'polite' : undefined}
            >
              {(['draft', 'review', 'saved'] as const).map((stage, index) => {
                const currentIndex =
                  visibleStage === 'draft' ? 0 : visibleStage === 'review' ? 1 : 2;
                const label =
                  stage === 'saved' && visibleStage === 'saving'
                    ? 'Guardando…'
                    : lifecycleStageLabels[stage];
                return (
                  <li
                    key={stage}
                    className={
                      stage === visibleStage || (stage === 'saved' && visibleStage === 'saving')
                        ? 'is-current'
                        : index < currentIndex
                          ? 'is-complete'
                          : undefined
                    }
                    aria-current={
                      stage === visibleStage || (stage === 'saved' && visibleStage === 'saving')
                        ? 'step'
                        : undefined
                    }
                  >
                    {stage === 'saved' && visibleStage === 'saving' && <Spinner size={15} />}
                    <span>{label}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>

      {stale && (
        <p className={isAssistant ? 'clinical-warning' : 'mt-4 text-sm text-[var(--warning)]'}>
          La nota original cambió. Regenera antes de preparar el guardado.
        </p>
      )}

      {dateControls && onEvolutionAtChange && (
        <div className="evolution-review-artifact__date-controls">
          <input
            aria-label="Fecha de evolución"
            type="date"
            value={parts.date}
            onChange={(event) => updateDate(event.target.value, parts.time)}
          />
          <input
            aria-label="Hora de evolución"
            type="time"
            value={parts.time}
            onChange={(event) => updateDate(parts.date, event.target.value)}
          />
        </div>
      )}

      {showSource && !isAssistant && (
        <div className="evolution-review-artifact__source">
          <span>Nota clínica original</span>
          {editingSource && sourceEditable ? (
            <textarea
              rows={2}
              value={sourceEditingValue}
              onChange={(event) => setSourceEditingValue(event.target.value)}
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
                isAssistant
                  ? 'clinical-secondary-button'
                  : 'text-sm text-[var(--accent)] hover:underline'
              }
              onClick={editingSource ? cancelSourceEdit : startSourceEdit}
            >
              {editingSource ? 'Cerrar edición' : 'Editar nota fuente'}
            </button>
          )}
        </div>
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
              <span>{label}</span>
              {!readOnly && editingField !== key && (
                <button
                  type="button"
                  className={
                    isAssistant
                      ? 'clinical-field-edit'
                      : 'text-sm text-[var(--accent)] hover:underline'
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
            {editingField === key ? (
              <>
                <textarea
                  rows={isAssistant ? 2 : 3}
                  value={editingValue}
                  onChange={(event) => setEditingValue(event.target.value)}
                  aria-label={label}
                />
                <div className="evolution-review-artifact__field-actions">
                  <button
                    type="button"
                    className="text-sm text-[var(--text-secondary)] hover:underline"
                    onClick={cancelFieldEdit}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className={
                      isAssistant
                        ? 'clinical-secondary-button'
                        : 'text-sm text-[var(--accent)] hover:underline'
                    }
                    onClick={applyFieldEdit}
                  >
                    Aplicar
                  </button>
                </div>
              </>
            ) : (
              <p className="evolution-review-artifact__field-value">
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
              <span aria-label={`${draft.review_flags.length} observaciones`}>
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
              {editingSource && sourceEditable && (
                <div className="clinical-source-editor">
                  <textarea
                    rows={3}
                    value={sourceEditingValue}
                    onChange={(event) => {
                      setSourceEditingValue(event.target.value);
                      setSourceSaveState('idle');
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
                        : ''}
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
                className="rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white disabled:opacity-50"
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

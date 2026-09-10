import { AlertTriangle, ChevronDown, Pencil, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { ClinicalDraft } from '../../lib/api';
import { formatClinicalDateTime } from '../../lib/clinicalDate';
import { Spinner } from '../Spinner';
import { clinicalFields, hasClinicalContent } from './evolutionFields';

interface EvolutionReviewArtifactProps {
  mode: 'assistant' | 'manual';
  sourceNote: string;
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
  staleMessageId?: string;
  syncState?: 'idle' | 'saving' | 'saved' | 'error';
  onRetrySync?: () => void;
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
  staleMessageId,
  syncState = 'idle',
  onRetrySync,
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
  const assistantLifecycle = stale ? 'Necesita regeneración' : 'Borrador';
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
    <article
      className={isAssistant ? 'clinical-artifact' : 'evolution-review-artifact'}
      aria-label="Evolución propuesta"
    >
      <div
        className={isAssistant ? 'clinical-artifact-heading' : 'evolution-review-artifact__heading'}
      >
        <div>
          <h3>
            {isAssistant && <Sparkles aria-hidden="true" size={15} />}{' '}
            {isAssistant ? 'Evolución propuesta' : 'Borrador para revisar'}
          </h3>
          <div className="clinical-artifact-metadata">
            <time dateTime={evolutionAt}>{formatClinicalDateTime(evolutionAt)}</time>
            {onEvolutionAtChange && (
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
            <span className="clinical-artifact-status">Borrador asistido</span>
            <span className="clinical-artifact-status">{assistantLifecycle}</span>
            {draft.review_flags.length > 0 && <span>{draft.review_flags.length} por revisar</span>}
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

      <div className={isAssistant ? 'clinical-draft-fields' : 'evolution-review-artifact__fields'}>
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
                        ? 'clinical-primary-button'
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
          aria-label="Información por revisar"
        >
          <button
            type="button"
            className="clinical-review-flags__toggle"
            aria-expanded={flagsOpen}
            onClick={() => setFlagsOpen((current) => !current)}
          >
            <AlertTriangle aria-hidden="true" size={16} />
            <span>
              {draft.review_flags.length}{' '}
              {draft.review_flags.length === 1 ? 'elemento requiere' : 'elementos requieren'}{' '}
              revisión
            </span>
            <ChevronDown aria-hidden="true" size={15} />
          </button>
          {flagsOpen && (
            <ul>
              {draft.review_flags.map((flag) => (
                <li key={`${flag.source_text}-${flag.reason}`}>
                  <q>{flag.source_text}</q> {flag.reason}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {showSource && isAssistant && (
        <div className="clinical-source-note">
          <button
            type="button"
            className="clinical-source-note__toggle"
            aria-expanded={sourceOpen}
            onClick={() => setSourceOpen((current) => !current)}
          >
            <ChevronDown aria-hidden="true" size={15} />
            {sourceOpen ? 'Ocultar nota clínica original' : 'Ver nota clínica original'}
          </button>
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

      <div
        className={isAssistant ? 'clinical-artifact-actions' : 'evolution-review-artifact__actions'}
      >
        {isAssistant && (
          <div className={`clinical-sync-state is-${syncState}`} role="status" aria-live="polite">
            <span>
              {syncState === 'saving'
                ? 'Guardando…'
                : syncState === 'error'
                  ? 'No pudimos guardar estos cambios. Tu contenido sigue aquí.'
                  : syncState === 'saved'
                    ? 'Cambios guardados'
                    : edited
                      ? 'Cambios sin guardar'
                      : 'Borrador listo'}
            </span>
            {syncState === 'error' && onRetrySync && (
              <button type="button" onClick={onRetrySync}>
                Reintentar
              </button>
            )}
          </div>
        )}
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
              className="clinical-primary-button"
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
            ) : (
              'Preparar para guardar'
            )}
          </button>
        ) : null}
      </div>
    </article>
  );
}

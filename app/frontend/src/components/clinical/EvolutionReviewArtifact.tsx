import { useState } from 'react';
import type { ClinicalDraft } from '../../lib/api';
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
  onChange: (draft: ClinicalDraft) => void;
  onSourceChange?: (sourceNote: string) => void;
  onEvolutionAtChange?: (evolutionAt: string) => void;
  onRegenerate?: () => void;
  onPrepare?: () => void;
  onSave?: () => void;
  staleMessageId?: string;
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
  onChange,
  onSourceChange,
  onEvolutionAtChange,
  onRegenerate,
  onPrepare,
  onSave,
  staleMessageId,
}: EvolutionReviewArtifactProps) {
  const [editingSource, setEditingSource] = useState(false);
  const [editingField, setEditingField] = useState<ClinicalFieldKey | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [dateControls, setDateControls] = useState(showDateTime);
  const isAssistant = mode === 'assistant';
  const emptyDraft = !hasClinicalContent(draft);
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

  return (
    <article
      className={isAssistant ? 'clinical-artifact' : 'evolution-review-artifact'}
      aria-label="Evolución propuesta"
    >
      <div
        className={isAssistant ? 'clinical-artifact-heading' : 'evolution-review-artifact__heading'}
      >
        <div>
          <h3>{isAssistant ? 'Evolución propuesta' : 'Borrador para revisar'}</h3>
          <p>{stale ? 'Necesita regeneración' : edited ? 'Editada' : 'No guardada'}</p>
        </div>
        {isAssistant && <span className="clinical-artifact-status">Borrador asistido</span>}
      </div>

      {stale && (
        <p className={isAssistant ? 'clinical-warning' : 'mt-4 text-sm text-[var(--warning)]'}>
          La nota original cambió. Regenera antes de preparar el guardado.
        </p>
      )}

      {showSource && (
        <div className={isAssistant ? 'clinical-source-note' : 'evolution-review-artifact__source'}>
          <span>Nota clínica original</span>
          {editingSource && sourceEditable ? (
            <textarea
              rows={2}
              value={sourceNote}
              onChange={(event) => onSourceChange?.(event.target.value)}
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
              onClick={() => setEditingSource((current) => !current)}
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
                      ? 'clinical-secondary-button'
                      : 'text-sm text-[var(--accent)] hover:underline'
                  }
                  onClick={() => startFieldEdit(key)}
                >
                  Editar
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
          <h4>{isAssistant ? 'Información por revisar' : 'Detalles de revisión'}</h4>
          <ul>
            {draft.review_flags.map((flag) => (
              <li key={`${flag.source_text}-${flag.reason}`}>
                ⚠ <q>{flag.source_text}</q> — {flag.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={isAssistant ? 'clinical-artifact-date' : 'evolution-review-artifact__date'}>
        <time dateTime={evolutionAt}>{new Date(evolutionAt).toLocaleString('es-CL')}</time>
        {onEvolutionAtChange && (
          <button
            type="button"
            className={
              isAssistant
                ? 'clinical-secondary-button'
                : 'text-sm text-[var(--accent)] hover:underline'
            }
            onClick={() => setDateControls((current) => !current)}
          >
            {dateControls ? 'Cerrar fecha y hora' : 'Cambiar fecha y hora'}
          </button>
        )}
      </div>
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

      <div
        className={isAssistant ? 'clinical-artifact-actions' : 'evolution-review-artifact__actions'}
      >
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
            {saving ? 'Guardando...' : 'Guardar evolución'}
          </button>
        ) : !readOnly && onPrepare ? (
          <button
            type="button"
            className="clinical-primary-button"
            disabled={emptyDraft || editingField !== null}
            onClick={onPrepare}
          >
            Preparar para guardar
          </button>
        ) : null}
      </div>
    </article>
  );
}

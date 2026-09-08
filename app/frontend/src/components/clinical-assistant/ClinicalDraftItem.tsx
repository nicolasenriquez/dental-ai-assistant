import { useState } from 'react';
import type { ClinicalDraftItem as DraftItemData } from '../../hooks/useClinicalAssistant';
import type { ClinicalDraft } from '../../lib/api';

const fields: Array<[keyof Omit<ClinicalDraft, 'review_flags'>, string]> = [
  ['context', 'Motivo / contexto'],
  ['findings', 'Hallazgos'],
  ['assessment', 'Diagnóstico / impresión clínica'],
  ['treatment', 'Tratamiento / conducta'],
  ['follow_up', 'Seguimiento'],
];

interface ClinicalDraftItemProps {
  item: DraftItemData;
  onChange: (draft: ClinicalDraft) => void;
  onSourceChange: (sourceNote: string) => void;
  onRegenerate: () => void;
  onPrepare: () => void;
}

export function ClinicalDraftItem({ item, onChange, onSourceChange, onRegenerate, onPrepare }: ClinicalDraftItemProps) {
  const [confirmReplace, setConfirmReplace] = useState(false);
  const stale = item.stale;
  const emptyDraft = fields.every(([key]) => !item.draft[key].trim());
  return (
    <article className="clinical-artifact" aria-label="Evolución propuesta">
      <div className="clinical-artifact-heading">
        <div>
          <h3>Evolución propuesta</h3>
          <p>{stale ? 'Necesita regeneración' : item.edited ? 'Editada' : 'No guardada'}</p>
        </div>
        <span className="clinical-artifact-status">Borrador asistido</span>
      </div>
      {stale && <p className="clinical-warning">La nota original cambió. Regenera antes de preparar el guardado.</p>}
      <label className="clinical-source-note">
        <span>Nota clínica original</span>
        <textarea
          rows={2}
          value={item.sourceNote}
          onChange={(event) => {
            setConfirmReplace(false);
            onSourceChange(event.target.value);
          }}
        />
      </label>
      <div className="clinical-draft-fields">
        {fields.map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <textarea
              rows={2}
              value={item.draft[key]}
              onChange={(event) => onChange({ ...item.draft, [key]: event.target.value })}
            />
          </label>
        ))}
      </div>
      {item.draft.review_flags.length > 0 && (
        <section className="clinical-review-flags" aria-label="Información por revisar">
          <h4>Información por revisar</h4>
          <ul>
            {item.draft.review_flags.map((flag) => <li key={`${flag.source_text}-${flag.reason}`}>⚠ {flag.source_text} — {flag.reason}</li>)}
          </ul>
        </section>
      )}
      <div className="clinical-artifact-actions">
        <button type="button" className="clinical-secondary-button" onClick={() => onChange(item.draft)}>Editar</button>
        {stale ? (
          confirmReplace ? (
            <span className="clinical-regeneration-confirmation">
              <span>Reemplazar el borrador editado</span>
              <button type="button" className="clinical-secondary-button" onClick={() => setConfirmReplace(false)}>Cancelar</button>
              <button type="button" className="clinical-primary-button" onClick={() => { setConfirmReplace(false); onRegenerate(); }}>Regenerar</button>
            </span>
          ) : (
            <button type="button" className="clinical-primary-button" onClick={() => item.edited ? setConfirmReplace(true) : onRegenerate()}>Regenerar</button>
          )
        ) : <button type="button" className="clinical-primary-button" disabled={emptyDraft} onClick={onPrepare}>Preparar para guardar</button>}
      </div>
    </article>
  );
}

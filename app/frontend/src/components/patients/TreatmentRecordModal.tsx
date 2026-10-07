import { type MutableRefObject, useEffect, useState } from 'react';
import type { useDentalWorkspace } from '../../hooks/useDentalWorkspace';
import type { PatientTreatment, ToothSurface } from '../../lib/api';
import { formatClinicalDateShort, formatClinicalTime } from '../../lib/clinicalDate';
import { treatmentAnatomy, treatmentMembers } from '../../lib/treatmentAnatomy';
import { Button } from '../ui/Button';
import { DentalConditionModal } from './DentalConditionModal';
import { PatientActorLabel } from './PatientActorLabel';

interface TreatmentRecordModalProps {
  record: PatientTreatment;
  dental: ReturnType<typeof useDentalWorkspace>;
  returnFocus: HTMLElement | null;
  suspended: boolean;
  onDirty: (dirty: boolean) => void;
  onSaveAvailable: (available: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
  saveRef: MutableRefObject<(() => Promise<void>) | null>;
}

export function TreatmentRecordModal({
  record,
  dental,
  returnFocus,
  suspended,
  onDirty,
  onSaveAvailable,
  onClose,
  onSaved,
  saveRef,
}: TreatmentRecordModalProps): JSX.Element {
  const [base, setBase] = useState(record);
  const [note, setNote] = useState(record.note ?? '');
  const [surfaces, setSurfaces] = useState<ToothSurface[]>(record.teeth[0]?.surfaces ?? []);
  const [reason, setReason] = useState('');
  const [replacement, setReplacement] = useState('');
  const [review, setReview] = useState(false);
  const [conflict, setConflict] = useState(false);
  const variant = dental.treatmentCatalog?.variants.find((v) => v.id === base.variant_id);
  const immutable = base.state !== 'existing';
  const locked = dental.busy || !!dental.attempt;
  useEffect(() => {
    onDirty(
      note !== (record.note ?? '') ||
        JSON.stringify(surfaces) !== JSON.stringify(record.teeth[0]?.surfaces ?? []) ||
        !!reason ||
        !!replacement ||
        !!dental.attempt,
    );
  }, [note, surfaces, reason, replacement, dental.attempt, record, onDirty]);
  useEffect(() => {
    if (dental.latestTreatment) setConflict(true);
  }, [dental.latestTreatment]);
  useEffect(() => {
    onSaveAvailable(
      !immutable && !conflict && ((!reason && !replacement) || review || !!dental.attempt),
    );
  }, [immutable, conflict, reason, replacement, review, dental.attempt, onSaveAvailable]);
  const save = async (): Promise<void> => {
    if (conflict || immutable || (!dental.attempt && (reason || replacement) && !review)) return;
    const saved = dental.attempt
      ? await dental.retry()
      : review
        ? await dental.correctTreatment(
            base,
            reason.trim(),
            replacement
              ? {
                  variant_id: replacement,
                  dentition: base.dentition,
                  arch: base.arch,
                  teeth: base.teeth.map((member) => ({
                    ...member,
                    surfaces: dental.treatmentCatalog?.variants.find((v) => v.id === replacement)
                      ?.surface_codes.length
                      ? surfaces
                      : [],
                  })),
                  note: note.trim() || null,
                }
              : undefined,
          )
        : await dental.editTreatment(
            base,
            note,
            variant?.surface_codes.length ? surfaces : undefined,
          );
    if (saved) onSaved();
  };
  saveRef.current = save;
  return (
    <DentalConditionModal
      label="Editar procedimiento"
      returnFocus={returnFocus}
      suspended={suspended}
      onClose={() => {
        if (!dental.busy) onClose();
      }}
    >
      <div className="space-y-3">
        <h3 className="font-semibold">
          {base.label_es} · {treatmentAnatomy(base)}
        </h3>
        <p className="text-sm text-muted">{treatmentMembers(base)}</p>
        <p>
          {immutable ? 'Registrado por error · Solo lectura' : 'Existente · Observación manual'} ·
          Revisión {base.revision}
        </p>
        <label className="block" htmlFor="treatment-note">
          Nota de procedimiento
        </label>
        <textarea
          id="treatment-note"
          className="min-h-24 w-full rounded border border-border bg-surface p-3"
          maxLength={1000}
          disabled={locked || immutable}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setReview(false);
          }}
        />
        {variant?.surface_codes.length ? (
          <fieldset disabled={locked || immutable}>
            <legend>Superficies</legend>
            <div className="flex flex-wrap gap-2">
              {variant.surface_codes.map((surface) => (
                <label key={surface} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={surfaces.includes(surface)}
                    onChange={(event) => {
                      setReview(false);
                      setSurfaces(
                        event.target.checked
                          ? [...surfaces, surface]
                          : surfaces.filter((s) => s !== surface),
                      );
                    }}
                  />
                  {surface}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        {!immutable && (
          <details
            onToggle={(event) => {
              if (!event.currentTarget.open) setReview(false);
            }}
          >
            <summary className="min-h-11 cursor-pointer">Corregir registro</summary>
            <p>El original quedará registrado por error. Su evidencia e historial se conservan.</p>
            <label htmlFor="treatment-reason">Motivo de corrección</label>
            <textarea
              id="treatment-reason"
              className="min-h-24 w-full rounded border border-border bg-surface p-3"
              disabled={locked}
              maxLength={1000}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setReview(false);
              }}
            />
            <label htmlFor="treatment-replacement">Variante de reemplazo</label>
            <select
              id="treatment-replacement"
              className="min-h-11 w-full rounded border border-border bg-surface p-2"
              disabled={locked}
              value={replacement}
              onChange={(event) => {
                setReplacement(event.target.value);
                setReview(false);
              }}
            >
              <option value="">Sin reemplazo</option>
              {dental.treatmentCatalog?.variants
                .filter(
                  (v) =>
                    v.enabled &&
                    v.scope === base.scope &&
                    (base.scope !== 'multi_tooth' || v.clinical_type === base.clinical_type),
                )
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label_es}
                  </option>
                ))}
            </select>
            <Button
              variant="clinicalSecondary"
              disabled={locked || !reason.trim()}
              onClick={() => setReview(true)}
            >
              Revisar corrección
            </Button>
          </details>
        )}
        {review && (
          <p role="status">
            Confirmar corrección: {base.label_es}, {treatmentAnatomy(base)}. Motivo: {reason}.
            Evidencia original: {base.note || 'Sin nota'} ·{' '}
            {base.teeth[0]?.surfaces.join(', ') || 'Pieza completa'}.{' '}
            {replacement
              ? `Reemplazo: ${dental.treatmentCatalog?.variants.find((v) => v.id === replacement)?.label_es}`
              : 'Sin reemplazo.'}
            {replacement && (
              <>
                {' '}
                Nota del reemplazo: {note || 'Sin nota'} · Superficies:{' '}
                {surfaces.join(', ') || 'Pieza completa'}.
              </>
            )}
          </p>
        )}
        {dental.error && <p role="alert">{dental.error}</p>}
        {conflict && (
          <div className="space-y-2">
            <p>
              Tu nota: {note || 'Sin nota'} · Tus superficies:{' '}
              {surfaces.join(', ') || 'Pieza completa'}
            </p>
            <p>
              Versión actual {dental.latestTreatment?.revision}:{' '}
              {dental.latestTreatment?.note || 'Sin nota'} · Superficies actuales:{' '}
              {dental.latestTreatment?.teeth[0]?.surfaces.join(', ') || 'Pieza completa'}
            </p>
            <Button
              variant="clinicalSecondary"
              disabled={!dental.latestTreatment || dental.latestTreatment.state !== 'existing'}
              onClick={() => {
                if (dental.latestTreatment) {
                  setBase(dental.latestTreatment);
                  setConflict(false);
                  setReview(false);
                  dental.discard();
                }
              }}
            >
              Conservar mi borrador sobre versión actual
            </Button>
            <Button variant="clinicalSecondary" onClick={onClose}>
              Descartar cambios
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="clinicalSecondary" disabled={dental.busy} onClick={onClose}>
            Cerrar procedimiento
          </Button>
          {!immutable && (
            <Button
              variant="clinical"
              disabled={dental.busy || conflict || (!!reason && !review && !dental.attempt)}
              onClick={() => void save()}
            >
              {dental.attempt
                ? 'Reintentar operación'
                : review
                  ? 'Guardar corrección'
                  : 'Guardar procedimiento'}
            </Button>
          )}
          {dental.attempt && (
            <Button variant="clinicalSecondary" disabled={dental.busy} onClick={dental.discard}>
              Descartar intento
            </Button>
          )}
        </div>
        <h4 className="font-medium">Historial de procedimiento</h4>
        {dental.historyLoading && <p role="status">Cargando historial…</p>}
        {dental.historyError && <p role="alert">Historial incompleto. Reintenta su lectura.</p>}
        <ol className="space-y-3">
          {dental.history.map((entry) => (
            <li key={entry.id} className="border-t border-border pt-2">
              <p>
                Revisión {entry.revision} ·{' '}
                {entry.action === 'created'
                  ? 'Creado'
                  : entry.action === 'edited'
                    ? 'Editado'
                    : 'Corregido'}{' '}
                · {formatClinicalDateShort(entry.changed_at)} {formatClinicalTime(entry.changed_at)}
              </p>
              <p>
                {entry.after.label_es} · {entry.after.note || 'Sin nota'} ·{' '}
                {treatmentMembers(entry.after)}
              </p>
              {entry.reason && <p>Motivo: {entry.reason}</p>}
              {entry.before && (
                <p>
                  Evidencia anterior: {entry.before.label_es} · {entry.before.note || 'Sin nota'}
                </p>
              )}
              <PatientActorLabel actor={entry.actor} actors={dental.history.map((r) => r.actor)} />
            </li>
          ))}
        </ol>
        {(dental.historyError || dental.historyCursor) && (
          <Button
            variant="clinicalSecondary"
            disabled={dental.historyLoading}
            onClick={() => void dental.inspectHistory(base.id, !!dental.historyCursor)}
          >
            {dental.historyError ? 'Reintentar historial' : 'Cargar más historial'}
          </Button>
        )}
      </div>
    </DentalConditionModal>
  );
}

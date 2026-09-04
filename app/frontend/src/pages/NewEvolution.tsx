import { type ChangeEvent, type KeyboardEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import { type ClinicalDraft, generateEvolution, saveEvolution } from '../lib/api';

const MAX_RAW_NOTE_LENGTH = 40000;
const SHOW_COUNT_AT = 35000;
const EMPTY_DRAFT: ClinicalDraft = {
  context: '',
  findings: '',
  assessment: '',
  treatment: '',
  follow_up: '',
  review_flags: [],
};

type ClinicalField = Exclude<keyof ClinicalDraft, 'review_flags'>;
type WorkspaceState = 'editing_raw' | 'generating' | 'reviewing';

const fields: Array<{ key: ClinicalField; label: string }> = [
  { key: 'context', label: 'Motivo / contexto' },
  { key: 'findings', label: 'Hallazgos' },
  { key: 'assessment', label: 'Diagnostico / impresion clinica' },
  { key: 'treatment', label: 'Tratamiento / conducta' },
  { key: 'follow_up', label: 'Seguimiento' },
];

function localInputParts(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  return { date: local.slice(0, 10), time: local.slice(11) };
}

function composeDraft(draft: ClinicalDraft) {
  return fields
    .map(({ key, label }) => ({ label, value: draft[key].trim() }))
    .filter(({ value }) => value)
    .map(({ label, value }) => `${label}: ${value}`)
    .join('\n\n');
}

function toOffsetISOString(value: Date) {
  const offsetMinutes = -value.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const pad = (part: number) => String(Math.abs(part)).padStart(2, '0');
  const local = localInputParts(value);
  return `${local.date}T${local.time}:00${sign}${pad(Math.trunc(offsetMinutes / 60))}:${pad(offsetMinutes % 60)}`;
}

export function NewEvolution() {
  const { patientId = '' } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [workspace, setWorkspace] = useState<WorkspaceState>('editing_raw');
  const [rawNote, setRawNote] = useState('');
  const [draft, setDraft] = useState<ClinicalDraft>(EMPTY_DRAFT);
  const [generatedDraft, setGeneratedDraft] = useState<ClinicalDraft | null>(null);
  const [isDraftStale, setIsDraftStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRegeneration, setConfirmRegeneration] = useState(false);
  const [evolutionAt, setEvolutionAt] = useState(() => new Date());
  const [showDateTime, setShowDateTime] = useState(false);
  const [saveId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);

  const overLimit = rawNote.length > MAX_RAW_NOTE_LENGTH;
  const hasClinicalContent = fields.some(({ key }) => draft[key].trim());
  const hasHumanEdits = generatedDraft
    ? fields.some(({ key }) => draft[key] !== generatedDraft[key])
    : false;
  const canGenerate = rawNote.trim().length > 0 && !overLimit && workspace !== 'generating';
  const dateTime = localInputParts(evolutionAt);

  const runGeneration = async () => {
    setConfirmRegeneration(false);
    setError(null);
    setWorkspace('generating');
    try {
      const result = await generateEvolution(patientId, rawNote);
      setDraft(result);
      setGeneratedDraft(result);
      setIsDraftStale(false);
      setWorkspace('reviewing');
    } catch {
      setError('No pudimos redactar la evolucion. Puedes reintentar.');
      setWorkspace(generatedDraft ? 'reviewing' : 'editing_raw');
    }
  };

  const requestGeneration = () => {
    if (!canGenerate) return;
    if (generatedDraft && hasHumanEdits) {
      setConfirmRegeneration(true);
      return;
    }
    void runGeneration();
  };

  const changeRawNote = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setRawNote(event.target.value);
    if (generatedDraft) setIsDraftStale(true);
  };

  const changeClinicalField = (key: ClinicalField, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const changeDateTime = (date: string, time: string) => {
    if (!date || !time) return;
    setEvolutionAt(new Date(`${date}T${time}`));
  };

  const handleShortcut = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      requestGeneration();
    }
  };

  const save = async () => {
    if (!generatedDraft || !hasClinicalContent || isDraftStale || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveEvolution(patientId, {
        id: saveId,
        evolution_at: toOffsetISOString(evolutionAt),
        raw_note: rawNote,
        generated_text: composeDraft(generatedDraft),
        final_text: composeDraft(draft),
      });
      addToast('Evolucion guardada', 'success');
      navigate(`/patients/${patientId}`, { state: { announcement: 'Evolucion guardada' } });
    } catch {
      setError('No pudimos guardar la evolucion. Puedes reintentar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-full bg-[var(--bg)] p-6 text-[var(--text-primary)] md:p-8">
      <div className="mx-auto max-w-5xl">
        <Link
          to={`/patients/${patientId}`}
          className="text-sm text-[var(--accent)] hover:underline"
        >
          ‹ Volver al paciente
        </Link>
        <header className="mt-4">
          <h1 className="text-2xl font-semibold">Nueva evolucion dental</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
            <span>
              {evolutionAt.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
            <button
              type="button"
              onClick={() => setShowDateTime((shown) => !shown)}
              className="text-[var(--accent)] hover:underline"
            >
              Cambiar fecha y hora
            </button>
          </div>
          {showDateTime && (
            <div className="mt-3 flex flex-wrap gap-3">
              <input
                aria-label="Fecha de evolucion"
                type="date"
                value={dateTime.date}
                onChange={(event) => changeDateTime(event.target.value, dateTime.time)}
                className="rounded border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
              />
              <input
                aria-label="Hora de evolucion"
                type="time"
                value={dateTime.time}
                onChange={(event) => changeDateTime(dateTime.date, event.target.value)}
                className="rounded border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
              />
            </div>
          )}
        </header>

        <section className="mt-8">
          <h2 className="text-xs font-semibold tracking-wider text-[var(--text-secondary)]">
            {generatedDraft ? 'NOTA ORIGINAL' : 'NOTA RAPIDA'}
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Pega o escribe tus notas clinicas. La IA las ordenara para que las revises antes de
            guardar.
          </p>
          <textarea
            autoFocus
            aria-label="Nota rapida"
            value={rawNote}
            onChange={changeRawNote}
            onPaste={() => undefined}
            onKeyDown={handleShortcut}
            readOnly={workspace === 'generating' || workspace === 'reviewing'}
            rows={10}
            className="mt-3 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 outline-none focus:border-[var(--accent)] disabled:opacity-60"
          />
          {rawNote.length >= SHOW_COUNT_AT && !overLimit && (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {rawNote.length.toLocaleString('es-CL')} / 40.000 caracteres
            </p>
          )}
          {overLimit && (
            <p role="alert" className="mt-1 text-sm text-[var(--danger)]">
              La nota supera el limite de 40.000 caracteres. Reduce el contenido antes de continuar.
            </p>
          )}
          {workspace === 'reviewing' ? (
            <button
              type="button"
              onClick={() => setWorkspace('editing_raw')}
              className="mt-3 text-sm text-[var(--accent)] hover:underline"
            >
              Corregir nota y regenerar
            </button>
          ) : (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={!canGenerate}
                onClick={requestGeneration}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white disabled:opacity-50"
              >
                {workspace === 'generating'
                  ? 'Redactando evolucion...'
                  : generatedDraft
                    ? 'Regenerar'
                    : 'Redactar evolucion'}
              </button>
            </div>
          )}
        </section>

        {generatedDraft && (
          <section className="mt-8 border-t border-[var(--border)] pt-8">
            <h2 className="text-xs font-semibold tracking-wider text-[var(--text-secondary)]">
              EVOLUCION REDACTADA
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {fields.map(({ key, label }) => (
                <label
                  key={key}
                  className={
                    key === 'context' || key === 'findings' || key === 'assessment'
                      ? 'md:col-span-2'
                      : ''
                  }
                >
                  <span className="text-sm text-[var(--text-secondary)]">{label}</span>
                  <textarea
                    value={draft[key]}
                    onChange={(event) => changeClinicalField(key, event.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 outline-none focus:border-[var(--accent)]"
                  />
                </label>
              ))}
            </div>
            {draft.review_flags.length > 0 && (
              <div className="mt-6 border-t border-[var(--border)] pt-5">
                <h3 className="font-medium">Informacion por revisar</h3>
                <ul className="mt-2 space-y-2 text-sm text-[var(--text-secondary)]">
                  {draft.review_flags.map((flag) => (
                    <li key={`${flag.source_text}-${flag.reason}`}>
                      <q>{flag.source_text}</q> · {flag.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!hasClinicalContent && (
              <p className="mt-5 text-sm text-[var(--warning)]">
                No hay contenido clinico para guardar. Corrige la nota y vuelve a redactar, o
                completa manualmente al menos un campo.
              </p>
            )}
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                disabled={!hasClinicalContent || isDraftStale || saving}
                onClick={() => void save()}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white disabled:opacity-50"
              >
                {saving ? 'Guardando evolucion...' : 'Guardar evolucion'}
              </button>
            </div>
          </section>
        )}

        <div aria-live="polite" className="mt-4 text-sm text-[var(--text-secondary)]">
          {workspace === 'generating'
            ? 'Redactando evolucion...'
            : saving
              ? 'Guardando evolucion...'
              : error}
          {error && (
            <button
              type="button"
              onClick={error.includes('guardar') ? () => void save() : requestGeneration}
              className="ml-3 text-[var(--accent)] underline"
            >
              Reintentar
            </button>
          )}
        </div>
      </div>

      {confirmRegeneration && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="regenerate-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-6 shadow-2xl">
            <h2 id="regenerate-title" className="text-lg font-semibold">
              Regenerar evolucion
            </h2>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              Realizaste cambios en la evolucion redactada. Al regenerar, esos cambios seran
              reemplazados por un nuevo borrador.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRegeneration(false)}
                className="rounded border border-[var(--border)] px-3 py-2"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void runGeneration()}
                className="rounded bg-[var(--accent)] px-3 py-2 text-white"
              >
                Regenerar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

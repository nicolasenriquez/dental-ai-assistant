import { useEffect, useRef, useState } from 'react';
import {
  type DriveJournalDetail,
  type DriveJournalEntry,
  type DriveJournalPreferences,
  type DriveJournalSummary,
  type DriveJournalTarget,
  getDriveJournalDetail,
  getDriveJournalPreferences,
  updateDriveJournalPreferences,
} from '../../lib/api';
import { filterDriveJournalEntries, groupDriveJournals } from '../../lib/driveJournals';
import { Spinner } from '../Spinner';

interface DriveJournalSelection {
  period_type: DriveJournalSummary['period_type'];
  period_key: string;
  journal_part: number;
  display_name?: string;
}

interface DriveJournalPanelProps {
  journals: DriveJournalSummary[];
  loading: boolean;
  initialTarget?: DriveJournalTarget | null;
  onInitialTargetConsumed?: () => void;
}

function journalKey(journal: DriveJournalSelection): string {
  return `${journal.period_type}:${journal.period_key}:${journal.journal_part}`;
}

function groupKey(journal: DriveJournalSelection): string {
  return `${journal.period_type}:${journal.period_key}`;
}

function modifiedLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha desconocida';
  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function periodLabel(journal: DriveJournalSelection): string {
  const group = groupDriveJournals([
    {
      period_type: journal.period_type,
      period_key: journal.period_key,
      journal_part: journal.journal_part,
      display_name: journal.display_name ?? '',
      updated_at: '',
    },
  ])[0];
  return group?.label ?? journal.period_key;
}

function JournalEntry({
  entry,
  highlighted,
  entryRef,
}: {
  entry: DriveJournalEntry;
  highlighted: boolean;
  entryRef: (element: HTMLElement | null) => void;
}) {
  return (
    <article
      ref={entryRef}
      className={`drive-journal-entry${highlighted ? ' drive-journal-entry--highlighted' : ''}`}
      data-evolution-id={entry.evolution_id}
      tabIndex={-1}
      aria-labelledby={`journal-entry-${entry.evolution_id}`}
    >
      <header className="drive-journal-entry__header">
        <h3 id={`journal-entry-${entry.evolution_id}`}>{entry.patient_display_name}</h3>
        <span>{entry.patient_rut_masked}</span>
        <time dateTime={entry.occurred_at}>{modifiedLabel(entry.occurred_at)}</time>
      </header>
      <div className="drive-journal-entry__content">{entry.content}</div>
    </article>
  );
}

export function DriveJournalPanel({
  journals,
  loading,
  initialTarget = null,
  onInitialTargetConsumed,
}: DriveJournalPanelProps) {
  const [selectedJournal, setSelectedJournal] = useState<DriveJournalSelection | null>(null);
  const [detail, setDetail] = useState<DriveJournalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [missingEvolution, setMissingEvolution] = useState(false);
  const [targetEvolutionId, setTargetEvolutionId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [frequency, setFrequency] = useState<DriveJournalPreferences['frequency']>('weekly');
  const [preferenceLoading, setPreferenceLoading] = useState(true);
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [retryFrequency, setRetryFrequency] = useState<DriveJournalPreferences['frequency'] | null>(
    null,
  );
  const [highlightedEvolutionId, setHighlightedEvolutionId] = useState<string | null>(null);
  const entryRefs = useRef<Record<string, HTMLElement | null>>({});
  const loadSequence = useRef(0);
  const consumedTargetKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreferenceLoading(true);
    void getDriveJournalPreferences()
      .then((preferences) => {
        if (!cancelled) setFrequency(preferences.frequency);
      })
      .catch(() => {
        if (!cancelled) setPreferenceError('No se pudo cargar la preferencia de agrupación.');
      })
      .finally(() => {
        if (!cancelled) setPreferenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadDetail = async (selection: DriveJournalSelection, targetId: string | null) => {
    const sequence = ++loadSequence.current;
    setSelectedJournal(selection);
    setTargetEvolutionId(targetId);
    setDetail(null);
    setDetailError(null);
    setMissingEvolution(false);
    setHighlightedEvolutionId(null);
    setQuery('');
    setDetailLoading(true);
    try {
      const response = await getDriveJournalDetail(
        selection.period_type,
        selection.period_key,
        selection.journal_part,
      );
      if (sequence === loadSequence.current) setDetail(response.journal);
    } catch {
      if (sequence === loadSequence.current) setDetailError('No se pudo abrir este diario.');
    } finally {
      if (sequence === loadSequence.current) setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (!initialTarget) {
      consumedTargetKey.current = null;
      return;
    }
    const targetKey = [
      initialTarget.evolutionId,
      initialTarget.journal.period_type,
      initialTarget.journal.period_key,
      initialTarget.journal.journal_part,
    ].join(':');
    if (consumedTargetKey.current === targetKey) return;
    consumedTargetKey.current = targetKey;
    const selection: DriveJournalSelection = {
      period_type: initialTarget.journal.period_type,
      period_key: initialTarget.journal.period_key,
      journal_part: initialTarget.journal.journal_part,
      display_name: initialTarget.journal.display_name,
    };
    void loadDetail(selection, initialTarget.evolutionId);
    onInitialTargetConsumed?.();
  }, [
    initialTarget?.evolutionId,
    initialTarget?.journal.period_key,
    initialTarget?.journal.period_type,
    initialTarget?.journal.journal_part,
  ]);

  useEffect(() => {
    if (!detail || !targetEvolutionId) return;
    const target = detail.entries.find((entry) => entry.evolution_id === targetEvolutionId);
    if (!target) {
      setMissingEvolution(true);
      return;
    }

    setMissingEvolution(false);
    let timeout: number | undefined;
    const focusTarget = () => {
      const element = entryRefs.current[target.evolution_id];
      if (!element) return;
      element.focus({ preventScroll: true });
      element.scrollIntoView?.({
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        block: 'center',
      });
      setHighlightedEvolutionId(target.evolution_id);
      timeout = window.setTimeout(() => setHighlightedEvolutionId(null), 1400);
    };
    const frame = window.requestAnimationFrame?.(focusTarget);
    if (frame === undefined) focusTarget();
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame?.(frame);
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [detail, targetEvolutionId]);

  const saveFrequency = async (
    next: DriveJournalPreferences['frequency'],
    rollback: DriveJournalPreferences['frequency'],
  ) => {
    setPreferenceSaving(true);
    setPreferenceError(null);
    try {
      const saved = await updateDriveJournalPreferences(next);
      setFrequency(saved.frequency);
      setRetryFrequency(null);
    } catch {
      setFrequency(rollback);
      setRetryFrequency(next);
      setPreferenceError('No se pudo guardar la preferencia. Puedes reintentar.');
    } finally {
      setPreferenceSaving(false);
    }
  };

  const groups = groupDriveJournals(journals);
  const filteredEntries = detail ? filterDriveJournalEntries(detail, query) : [];
  const noResults = Boolean(detail && query.trim() && filteredEntries.length === 0);

  if (selectedJournal) {
    return (
      <section className="drive-journal-reader" aria-label="Lector de diarios">
        <button
          type="button"
          className="drive-btn drive-btn-secondary"
          onClick={() => {
            setSelectedJournal(null);
            setDetail(null);
            setTargetEvolutionId(null);
            setDetailError(null);
            setMissingEvolution(false);
            setQuery('');
          }}
        >
          Volver a Diarios
        </button>
        <header className="drive-journal-reader__header">
          <h2>
            {detail?.display_name ?? selectedJournal.display_name ?? periodLabel(selectedJournal)}
          </h2>
          <p>{periodLabel(selectedJournal)}</p>
          {detail && (
            <time dateTime={detail.updated_at}>Actualizado {modifiedLabel(detail.updated_at)}</time>
          )}
        </header>
        {detailLoading && <p className="drive-list-status">Cargando diario…</p>}
        {detailError && (
          <p className="drive-error" role="alert">
            {detailError}
          </p>
        )}
        {missingEvolution && (
          <p className="drive-error" role="alert">
            No encontramos la evolución solicitada en este diario remoto.
          </p>
        )}
        {detail && !detailError && (
          <>
            <div className="drive-journal-search-wrap">
              <input
                type="search"
                className="drive-search"
                aria-label="Buscar en este diario"
                placeholder="Buscar en este diario"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="drive-search-clear"
                  aria-label="Limpiar búsqueda del diario"
                  onClick={() => setQuery('')}
                >
                  ×
                </button>
              )}
            </div>
            {noResults ? (
              <div className="drive-empty-state" aria-live="polite">
                <p>No encontramos evoluciones para esta búsqueda.</p>
                <button
                  type="button"
                  className="drive-btn drive-btn-secondary"
                  onClick={() => setQuery('')}
                >
                  Limpiar búsqueda
                </button>
              </div>
            ) : (
              <div className="drive-journal-entries">
                {filteredEntries.map((entry) => (
                  <JournalEntry
                    key={entry.evolution_id}
                    entry={entry}
                    highlighted={highlightedEvolutionId === entry.evolution_id}
                    entryRef={(element) => {
                      entryRefs.current[entry.evolution_id] = element;
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <section className="drive-journals" aria-label="Diarios de evoluciones">
      <div className="drive-journal-preferences">
        <label htmlFor="drive-journal-frequency">Agrupar nuevas evoluciones</label>
        <select
          id="drive-journal-frequency"
          value={frequency}
          disabled={preferenceLoading || preferenceSaving}
          onChange={(event) => {
            const next = event.target.value as DriveJournalPreferences['frequency'];
            if (next !== frequency) void saveFrequency(next, frequency);
          }}
        >
          <option value="weekly">Semanal</option>
          <option value="daily">Diario</option>
        </select>
        {preferenceSaving && (
          <span className="drive-list-status" role="status">
            <Spinner /> Guardando…
          </span>
        )}
        <p>Los cambios solo afectan futuras evoluciones.</p>
        {preferenceError && (
          <div className="drive-inline-error" role="alert">
            <span>{preferenceError}</span>
            {retryFrequency && (
              <button
                type="button"
                className="drive-btn drive-btn-secondary"
                disabled={preferenceSaving}
                onClick={() => void saveFrequency(retryFrequency, frequency)}
              >
                Reintentar
              </button>
            )}
          </div>
        )}
      </div>
      {loading && <p className="drive-list-status">Cargando diarios…</p>}
      {!loading && groups.length === 0 && <p className="drive-empty-state">Aún no hay diarios.</p>}
      {!loading && groups.length > 0 && (
        <ul className="drive-file-list">
          {groups.map((group) => {
            const groupId = `${group.period_type}:${group.period_key}`;
            const expanded = expandedGroups.has(groupId);
            const singlePart = group.parts.length === 1;
            const latest = group.parts[group.parts.length - 1];
            return (
              <li key={groupId}>
                <button
                  type="button"
                  className="drive-file-row drive-journal-group"
                  aria-expanded={singlePart ? undefined : expanded}
                  onClick={() => {
                    if (singlePart) {
                      void loadDetail(group.parts[0], null);
                    } else {
                      setExpandedGroups((current) => {
                        const next = new Set(current);
                        if (next.has(groupId)) next.delete(groupId);
                        else next.add(groupId);
                        return next;
                      });
                    }
                  }}
                >
                  <span className="drive-file-main">
                    <strong>{group.label}</strong>
                    <span>
                      {singlePart ? group.parts[0].display_name : `${group.parts.length} partes`}
                    </span>
                  </span>
                  <time dateTime={latest.updated_at}>{modifiedLabel(latest.updated_at)}</time>
                </button>
                {!singlePart && expanded && (
                  <ul className="drive-journal-parts">
                    {group.parts.map((part) => (
                      <li key={journalKey(part)}>
                        <button
                          type="button"
                          className="drive-file-row drive-journal-part"
                          onClick={() => void loadDetail(part, null)}
                        >
                          <span className="drive-file-main">
                            <strong>Parte {part.journal_part}</strong>
                            <span>{part.display_name}</span>
                          </span>
                          <time dateTime={part.updated_at}>{modifiedLabel(part.updated_at)}</time>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

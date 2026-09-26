import { useEffect, useRef, useState } from 'react';
import type { ClinicalTranscriptItem } from '../../hooks/useClinicalAssistant';

export interface ActiveClinicalTurn {
  turnId: string;
  phase: 'running' | 'stopping';
}

interface ClinicalTurnProgressProps {
  turn: ActiveClinicalTurn;
  items: ClinicalTranscriptItem[];
}

const DEFAULT_LABEL = 'Preparando respuesta clínica';
const MIN_LABEL_DWELL_MS = 300;

function activityLabel(items: ClinicalTranscriptItem[]): string {
  const activities = items.filter((item) => item.type === 'activity');
  return (
    [...activities].reverse().find((item) => item.status === 'running')?.label ??
    [...activities].reverse().find((item) => item.status === 'pending')?.label ??
    DEFAULT_LABEL
  );
}

export function ClinicalTurnProgress({ turn, items }: ClinicalTurnProgressProps) {
  const userCreatedAt = items.find((item) => item.type === 'user')?.createdAt;
  const fallbackStart = useRef(Date.now());
  const startedAt = userCreatedAt ? Date.parse(userCreatedAt) : fallbackStart.current;
  const elapsed = () => Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const [seconds, setSeconds] = useState(elapsed);
  const candidate = activityLabel(items);
  const [visibleLabel, setVisibleLabel] = useState(DEFAULT_LABEL);
  const visibleSince = useRef(Date.now());
  const pendingLabel = useRef(candidate);
  const compact = items.some(
    (item) =>
      (item.type === 'assistant' && item.content.trim().length > 0) || item.type === 'draft',
  );

  useEffect(() => {
    setSeconds(elapsed());
    const interval = window.setInterval(() => setSeconds(elapsed()), 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  useEffect(() => {
    pendingLabel.current = candidate;
    if (turn.phase === 'stopping' || compact || candidate === visibleLabel) return;
    const remaining = Math.max(0, MIN_LABEL_DWELL_MS - (Date.now() - visibleSince.current));
    const timer = window.setTimeout(() => {
      setVisibleLabel(pendingLabel.current);
      visibleSince.current = Date.now();
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [candidate, compact, turn.phase, visibleLabel]);

  const stopping = turn.phase === 'stopping';
  const label = stopping ? 'Deteniendo respuesta…' : visibleLabel;
  return (
    <section
      className={`clinical-turn-progress${compact ? ' is-compact' : ''}`}
      data-turn-progress={turn.turnId}
    >
      <span className="sr-only" role="status" aria-live="polite">
        {compact && !stopping ? 'Trabajando' : label}
      </span>
      <div aria-hidden="true">
        <div className="clinical-turn-progress__heading">
          <span className="clinical-turn-progress__pulse" />
          <span>{stopping ? 'Deteniendo respuesta…' : 'Trabajando'}</span>
          <span className="clinical-turn-progress__elapsed">· {seconds} s</span>
        </div>
        {!compact && !stopping && <div className="clinical-turn-progress__label">{label}</div>}
      </div>
    </section>
  );
}

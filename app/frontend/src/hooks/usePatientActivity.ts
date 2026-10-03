import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type PatientActivityFilter,
  type PatientActivityPage,
  getPatientActivity,
} from '../lib/api';

export function usePatientActivity(patientId: string, kind: PatientActivityFilter) {
  const [page, setPage] = useState<PatientActivityPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const sequence = useRef(0);
  const attemptedCursor = useRef<string>();
  const load = useCallback(
    async (cursor?: string): Promise<void> => {
      const id = ++sequence.current;
      attemptedCursor.current = cursor;
      setLoading(true);
      setError(false);
      try {
        const next = await getPatientActivity(patientId, kind, cursor);
        if (id !== sequence.current) return;
        setPage((current) => {
          if (!cursor || !current) return next;
          const events = new Map(
            current.items.map((item) => [`${item.kind}:${item.event_id}`, item]),
          );
          for (const item of next.items) events.set(`${item.kind}:${item.event_id}`, item);
          return { ...next, items: [...events.values()] };
        });
      } catch {
        if (id === sequence.current) setError(true);
      } finally {
        if (id === sequence.current) setLoading(false);
      }
    },
    [patientId, kind],
  );
  useEffect(() => {
    setPage(null);
    void load();
    return () => {
      sequence.current += 1;
    };
  }, [load]);
  return {
    page,
    loading,
    error,
    retry: (): Promise<void> => load(attemptedCursor.current),
    loadMore: (): Promise<void> => load(page?.next_cursor ?? undefined),
  };
}

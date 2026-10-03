import { useCallback, useEffect, useRef, useState } from 'react';
import { type PendingWorkItem, type PendingWorkPage, getClinicalPendingWork } from '../lib/api';

export function useClinicalPendingWork(
  patientId?: string,
  kind?: PendingWorkItem['kind'],
  limit?: number,
) {
  const [page, setPage] = useState<PendingWorkPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(
    async (cursor?: string): Promise<void> => {
      const id = ++sequence.current;
      setLoading(true);
      setError(false);
      try {
        const next = await getClinicalPendingWork(
          patientId,
          cursor,
          kind || limit ? { kind, limit } : undefined,
        );
        if (id !== sequence.current) return;
        setPage((current) =>
          cursor && current
            ? {
                ...next,
                items: [...current.items, ...next.items].filter(
                  (item, index, items) =>
                    items.findIndex((candidate) => candidate.id === item.id) === index,
                ),
              }
            : next,
        );
      } catch {
        if (id === sequence.current) setError(true);
      } finally {
        if (id === sequence.current) setLoading(false);
      }
    },
    [patientId, kind, limit],
  );
  useEffect(() => {
    setPage(null);
    void load();
    const visible = () => {
      if (!document.hidden) void load();
    };
    window.addEventListener('focus', visible);
    return () => {
      sequence.current += 1;
      window.removeEventListener('focus', visible);
    };
  }, [load]);
  return {
    page,
    loading,
    error,
    refresh: () => load(),
    loadMore: () => load(page?.next_cursor ?? undefined),
  };
}

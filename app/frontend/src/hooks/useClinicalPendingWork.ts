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
  const loadedPages = useRef(1);
  const load = useCallback(
    async (cursor?: string, pageCount = 1): Promise<void> => {
      const id = ++sequence.current;
      setLoading(true);
      setError(false);
      try {
        let next = await getClinicalPendingWork(
          patientId,
          cursor,
          kind || limit ? { kind, limit } : undefined,
        );
        if (id !== sequence.current) return;
        let fetchedPages = 1;
        while (!cursor && next.next_cursor && fetchedPages < pageCount) {
          const following = await getClinicalPendingWork(
            patientId,
            next.next_cursor,
            kind || limit ? { kind, limit } : undefined,
          );
          if (id !== sequence.current) return;
          next = { ...following, items: [...next.items, ...following.items] };
          fetchedPages += 1;
        }
        loadedPages.current = cursor ? loadedPages.current + 1 : fetchedPages;
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
    loadedPages.current = 1;
    void load();
    const visible = () => {
      if (!document.hidden) void load(undefined, loadedPages.current);
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
    refresh: () => load(undefined, loadedPages.current),
    loadMore: () => (page?.next_cursor ? load(page.next_cursor) : Promise.resolve()),
  };
}

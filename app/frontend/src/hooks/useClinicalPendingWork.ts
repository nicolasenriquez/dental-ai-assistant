import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  type PendingWorkItem,
  type PendingWorkPage,
  getClinicalPendingWork,
} from '../lib/api';

function isInvalidPendingCursor(cause: unknown): boolean {
  if (!(cause instanceof ApiError) || cause.status !== 422) return false;
  const body = cause.body as { detail?: { code?: string } } | null | undefined;
  return body?.detail?.code === 'INVALID_PENDING_CURSOR';
}

function dedupe(items: PendingWorkItem[]): PendingWorkItem[] {
  return items.filter(
    (item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index,
  );
}

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
  const refocusing = useRef(false);
  const load = useCallback(
    async (cursor?: string, pageCount = 1): Promise<void> => {
      const id = ++sequence.current;
      setLoading(true);
      setError(false);
      const readWindow = async (
        start: string | undefined,
        depth: number,
      ): Promise<{ page: PendingWorkPage; fetchedPages: number } | null> => {
        let next = await getClinicalPendingWork(
          patientId,
          start,
          kind || limit ? { kind, limit } : undefined,
        );
        if (id !== sequence.current) return null;
        let fetchedPages = 1;
        while (!start && next.next_cursor && fetchedPages < depth) {
          const following = await getClinicalPendingWork(
            patientId,
            next.next_cursor,
            kind || limit ? { kind, limit } : undefined,
          );
          if (id !== sequence.current) return null;
          next = { ...following, items: dedupe([...next.items, ...following.items]) };
          fetchedPages += 1;
        }
        return { page: next, fetchedPages };
      };
      try {
        let result: { page: PendingWorkPage; fetchedPages: number } | null;
        let appended = Boolean(cursor);
        try {
          result = await readWindow(cursor, pageCount);
        } catch (cause) {
          if (id !== sequence.current) return;
          if (!isInvalidPendingCursor(cause)) throw cause;
          // A rejected cursor chain restarts from fresh page one at most once.
          appended = false;
          result = await readWindow(undefined, cursor ? loadedPages.current : pageCount);
        }
        if (!result) return;
        loadedPages.current = appended ? loadedPages.current + 1 : result.fetchedPages;
        setPage((current) =>
          appended && current
            ? { ...result.page, items: dedupe([...current.items, ...result.page.items]) }
            : result.page,
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
      if (document.hidden || refocusing.current) return;
      refocusing.current = true;
      void load(undefined, loadedPages.current).finally(() => {
        refocusing.current = false;
      });
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

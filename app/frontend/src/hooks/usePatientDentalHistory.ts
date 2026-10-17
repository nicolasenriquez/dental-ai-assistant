import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  type ConditionCatalog,
  type DentalHistoryCounts,
  type DentalHistoryCoverage,
  type DentalHistoryEvent,
  type DentalHistorySnapshotItem,
  type DentalHistorySnapshotPage,
  type Dentition,
  type TreatmentCatalog,
  getConditionCatalog,
  getPatientDentalHistory,
  getPatientDentalHistorySnapshot,
  getTreatmentCatalog,
} from '../lib/api';
import { normalizeConditionCatalog } from '../lib/odontogramPresentation';

export interface HistoryChart {
  at: string | null;
  items: DentalHistorySnapshotItem[];
  counts: DentalHistoryCounts;
  coverage: DentalHistoryCoverage;
  epoch: string;
}

export interface HistoryEvents {
  items: DentalHistoryEvent[];
  total: number;
  nextCursor: string | null;
  loading: boolean;
  failed: boolean;
}

export interface PatientDentalHistoryReads {
  chart: HistoryChart | null;
  chartLoading: boolean;
  chartFailed: boolean;
  invalidSelection: boolean;
  stale: boolean;
  events: HistoryEvents;
  dayEvents: HistoryEvents;
  catalog: ConditionCatalog | null;
  treatmentCatalog: TreatmentCatalog | null;
  refresh: () => void;
  retryChart: () => void;
  retryEvents: () => void;
  retryDayEvents: () => void;
  loadOlderEvents: () => void;
  loadMoreDayEvents: () => void;
}

const SNAPSHOT_PAGE_LIMIT = 100;
const EVENT_PAGE_LIMIT = 50;

const idleEvents: HistoryEvents = {
  items: [],
  total: 0,
  nextCursor: null,
  loading: false,
  failed: false,
};

function isStatus(caught: unknown, status: number): boolean {
  return caught instanceof ApiError && caught.status === status;
}

function mergeEvents(
  current: DentalHistoryEvent[],
  incoming: DentalHistoryEvent[],
): DentalHistoryEvent[] {
  return [...current, ...incoming].filter(
    (item, index, items) =>
      items.findIndex((candidate) => candidate.event_id === item.event_id) === index,
  );
}

// Owns read lifecycle for the historical view: page assembly, dataset epoch, cancellation
// and cross-patient/date rejection. It never calls a command client or a mutation hook.
export function usePatientDentalHistory(
  patientId: string,
  dentition: Dentition,
  at: string | null,
): PatientDentalHistoryReads {
  const [chart, setChart] = useState<HistoryChart | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartFailed, setChartFailed] = useState(false);
  const [invalidSelection, setInvalidSelection] = useState(false);
  const [stale, setStale] = useState(false);
  const [events, setEvents] = useState<HistoryEvents>(idleEvents);
  const [dayEvents, setDayEvents] = useState<HistoryEvents>(idleEvents);
  const [catalog, setCatalog] = useState<ConditionCatalog | null>(null);
  const [treatmentCatalog, setTreatmentCatalog] = useState<TreatmentCatalog | null>(null);
  const epoch = useRef<string | null>(null);
  const atRef = useRef(at);
  atRef.current = at;
  const alive = useRef(true);
  const chartSequence = useRef(0);
  const eventsSequence = useRef(0);
  const daySequence = useRef(0);
  const catalogsSequence = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const adoptEpoch = useCallback((value: string): boolean => {
    if (epoch.current === null) {
      epoch.current = value;
      return true;
    }
    if (epoch.current !== value) {
      setStale(true);
      return false;
    }
    return true;
  }, []);

  const loadChart = useCallback(
    async (selectedAt: string | null): Promise<void> => {
      const request = ++chartSequence.current;
      setChartLoading(true);
      setChartFailed(false);
      setInvalidSelection(false);
      const items: DentalHistorySnapshotItem[] = [];
      try {
        let cursor: string | undefined;
        let page: DentalHistorySnapshotPage | null = null;
        do {
          const response = await getPatientDentalHistorySnapshot(patientId, {
            dentition,
            at: selectedAt ?? undefined,
            epoch: epoch.current ?? undefined,
            cursor,
            limit: SNAPSHOT_PAGE_LIMIT,
          });
          if (!alive.current || request !== chartSequence.current) return;
          if (!adoptEpoch(response.epoch)) return;
          items.push(...response.items);
          page = response;
          cursor = response.next_cursor ?? undefined;
        } while (cursor);
        if (!alive.current || request !== chartSequence.current || !page) return;
        // A partial page set must never be presented as a complete historical chart.
        if (page.counts.records !== items.length) throw new Error('incomplete snapshot');
        setChart({
          at: page.selection.at,
          items,
          counts: page.counts,
          coverage: page.coverage,
          epoch: page.epoch,
        });
      } catch (caught) {
        if (!alive.current || request !== chartSequence.current) return;
        if (isStatus(caught, 409)) setStale(true);
        else if (isStatus(caught, 422)) setInvalidSelection(true);
        else setChartFailed(true);
      } finally {
        if (alive.current && request === chartSequence.current) setChartLoading(false);
      }
    },
    [adoptEpoch, dentition, patientId],
  );

  const loadEvents = useCallback(
    async (cursor?: string, reset = false): Promise<void> => {
      const request = ++eventsSequence.current;
      setEvents((current) =>
        reset ? { ...idleEvents, loading: true } : { ...current, loading: true, failed: false },
      );
      try {
        const page = await getPatientDentalHistory(patientId, {
          dentition,
          epoch: epoch.current ?? undefined,
          cursor,
          limit: EVENT_PAGE_LIMIT,
        });
        if (!alive.current || request !== eventsSequence.current) return;
        if (!adoptEpoch(page.epoch)) return;
        setEvents((current) => ({
          items: reset ? page.items : mergeEvents(current.items, page.items),
          total: page.total_events,
          nextCursor: page.next_cursor,
          loading: false,
          failed: false,
        }));
      } catch (caught) {
        if (!alive.current || request !== eventsSequence.current) return;
        if (isStatus(caught, 409)) setStale(true);
        setEvents((current) => ({ ...current, loading: false, failed: true }));
      }
    },
    [adoptEpoch, dentition, patientId],
  );

  const loadDayEvents = useCallback(
    async (day: string, cursor?: string): Promise<void> => {
      const request = ++daySequence.current;
      setDayEvents((current) => ({ ...current, loading: true, failed: false }));
      try {
        const page = await getPatientDentalHistory(patientId, {
          dentition,
          day,
          epoch: epoch.current ?? undefined,
          cursor,
          limit: EVENT_PAGE_LIMIT,
        });
        if (!alive.current || request !== daySequence.current) return;
        if (!adoptEpoch(page.epoch)) return;
        setDayEvents((current) => ({
          items: cursor ? mergeEvents(current.items, page.items) : page.items,
          total: page.total_events,
          nextCursor: page.next_cursor,
          loading: false,
          failed: false,
        }));
      } catch (caught) {
        if (!alive.current || request !== daySequence.current) return;
        if (isStatus(caught, 409)) setStale(true);
        setDayEvents((current) => ({ ...current, loading: false, failed: true }));
      }
    },
    [adoptEpoch, dentition, patientId],
  );

  useEffect(() => {
    epoch.current = null;
    setStale(false);
    setChart(null);
    setEvents({ ...idleEvents, loading: true });
    void loadEvents(undefined, true);
    return () => {
      eventsSequence.current++;
    };
  }, [loadEvents]);

  useEffect(() => {
    void loadChart(at);
    if (at) void loadDayEvents(at);
    else setDayEvents(idleEvents);
    return () => {
      chartSequence.current++;
      daySequence.current++;
    };
  }, [at, loadChart, loadDayEvents]);

  useEffect(() => {
    const request = ++catalogsSequence.current;
    void (async () => {
      try {
        const [conditions, treatments] = await Promise.all([
          getConditionCatalog().then(normalizeConditionCatalog),
          getTreatmentCatalog(),
        ]);
        if (!alive.current || request !== catalogsSequence.current) return;
        setCatalog(conditions);
        setTreatmentCatalog(treatments);
      } catch {
        // Labels degrade to their catalog fallback; a missing catalog is never a failed history read.
      }
    })();
    return () => {
      catalogsSequence.current++;
    };
  }, []);

  const refresh = useCallback((): void => {
    epoch.current = null;
    setStale(false);
    void loadEvents(undefined, true);
    void loadChart(atRef.current);
    if (atRef.current) void loadDayEvents(atRef.current);
    else setDayEvents(idleEvents);
  }, [loadChart, loadDayEvents, loadEvents]);

  const retryChart = useCallback((): void => {
    void loadChart(atRef.current);
  }, [loadChart]);

  const retryEvents = useCallback((): void => {
    void loadEvents(undefined, true);
  }, [loadEvents]);

  const retryDayEvents = useCallback((): void => {
    if (atRef.current) void loadDayEvents(atRef.current);
  }, [loadDayEvents]);

  const loadOlderEvents = useCallback((): void => {
    if (events.nextCursor) void loadEvents(events.nextCursor);
  }, [events.nextCursor, loadEvents]);

  const loadMoreDayEvents = useCallback((): void => {
    if (atRef.current && dayEvents.nextCursor)
      void loadDayEvents(atRef.current, dayEvents.nextCursor);
  }, [dayEvents.nextCursor, loadDayEvents]);

  return {
    chart,
    chartLoading,
    chartFailed,
    invalidSelection,
    stale,
    events,
    dayEvents,
    catalog,
    treatmentCatalog,
    refresh,
    retryChart,
    retryEvents,
    retryDayEvents,
    loadOlderEvents,
    loadMoreDayEvents,
  };
}

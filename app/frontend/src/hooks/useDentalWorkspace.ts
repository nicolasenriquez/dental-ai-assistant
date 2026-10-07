import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  type CorrectPatientCondition,
  type CorrectPatientTreatment,
  type CreatePatientCondition,
  type CreatePatientTreatment,
  type EditPatientTreatment,
  type PatientCondition,
  type PatientTreatment,
  type TreatmentCatalog,
  type TreatmentInput,
  type TreatmentRevision,
  correctPatientCondition,
  correctPatientTreatment,
  createPatientCondition,
  createPatientTreatment,
  getPatientTreatmentRevisions,
  getPatientTreatments,
  getTreatmentCatalog,
  updatePatientTreatment,
} from '../lib/api';

interface ApplicationAttempt {
  kind: 'apply';
  body: CreatePatientCondition;
}
interface UndoAttempt {
  kind: 'undo';
  id: string;
  body: CorrectPatientCondition;
}
type TreatmentAttempt =
  | { kind: 'treatment-apply'; body: CreatePatientTreatment }
  | { kind: 'treatment-edit'; id: string; body: EditPatientTreatment }
  | { kind: 'treatment-correct'; id: string; body: CorrectPatientTreatment };
type DentalAttempt = ApplicationAttempt | UndoAttempt | TreatmentAttempt;
interface DentalWorkspace {
  activeTool: string | null;
  selectTool: (code: string | null) => void;
  busy: boolean;
  error: string | null;
  attempt: DentalAttempt | null;
  applied: PatientCondition | null;
  apply: (body: Omit<CreatePatientCondition, 'id'>) => Promise<boolean>;
  undo: () => Promise<boolean>;
  retry: () => Promise<boolean>;
  discard: () => void;
  treatmentCatalog: TreatmentCatalog | null;
  treatmentCatalogError: boolean;
  refreshCatalog: () => Promise<void>;
  treatments: PatientTreatment[];
  treatmentLoading: boolean;
  treatmentReadError: boolean;
  refreshTreatments: () => Promise<void>;
  appliedTreatment: PatientTreatment | null;
  latestTreatment: PatientTreatment | null;
  applyTreatment: (body: Omit<TreatmentInput, 'id'>) => Promise<boolean>;
  editTreatment: (
    record: PatientTreatment,
    note: string,
    surfaces: EditPatientTreatment['surfaces'],
  ) => Promise<boolean>;
  correctTreatment: (
    record: PatientTreatment,
    reason: string,
    replacement?: Omit<TreatmentInput, 'id'>,
  ) => Promise<boolean>;
  history: TreatmentRevision[];
  historyError: boolean;
  historyLoading: boolean;
  historyCursor: string | null;
  inspectHistory: (id: string, more?: boolean) => Promise<void>;
}

// Owns chart intent and frozen commands. Saved-record edits retain their existing revision workflow.
export function useDentalWorkspace(
  patientId: string,
  onCommitted: (record?: PatientCondition) => void,
): DentalWorkspace {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<DentalAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<PatientCondition | null>(null);
  const [appliedTreatment, setAppliedTreatment] = useState<PatientTreatment | null>(null);
  const [latestTreatment, setLatestTreatment] = useState<PatientTreatment | null>(null);
  const [treatmentCatalog, setTreatmentCatalog] = useState<TreatmentCatalog | null>(null);
  const [treatmentCatalogError, setTreatmentCatalogError] = useState(false);
  const [treatments, setTreatments] = useState<PatientTreatment[]>([]);
  const [treatmentLoading, setTreatmentLoading] = useState(true);
  const [treatmentReadError, setTreatmentReadError] = useState(false);
  const [history, setHistory] = useState<TreatmentRevision[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const historySequence = useRef(0);
  const readSequence = useRef(0);
  const locked = useRef(false);
  const mountedPatient = useRef(patientId);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  mountedPatient.current = patientId;
  const refreshTreatments = useCallback(async (): Promise<void> => {
    const request = ++readSequence.current;
    setTreatmentLoading(true);
    setTreatmentReadError(false);
    try {
      let cursor: string | undefined;
      const all: PatientTreatment[] = [];
      do {
        const page = await getPatientTreatments(patientId, { cursor, limit: 100 });
        if (!alive.current || request !== readSequence.current) return;
        for (const item of page.items) if (!all.some((r) => r.id === item.id)) all.push(item);
        setTreatments([...all]);
        cursor = page.next_cursor ?? undefined;
      } while (cursor);
    } catch {
      if (alive.current && request === readSequence.current) setTreatmentReadError(true);
    } finally {
      if (alive.current && request === readSequence.current) setTreatmentLoading(false);
    }
  }, [patientId]);
  const refreshCatalog = useCallback(async (): Promise<void> => {
    try {
      const value = await getTreatmentCatalog();
      if (alive.current) {
        setTreatmentCatalog(value);
        setTreatmentCatalogError(false);
      }
    } catch {
      if (alive.current) setTreatmentCatalogError(true);
    }
  }, []);
  useEffect(() => {
    void refreshTreatments();
    void refreshCatalog();
    return () => {
      readSequence.current++;
      historySequence.current++;
    };
  }, [refreshTreatments, refreshCatalog]);
  const inspectHistory = async (id: string, more = false): Promise<void> => {
    const request = ++historySequence.current;
    setHistoryLoading(true);
    setHistoryError(false);
    if (!more) {
      setHistory([]);
      setHistoryCursor(null);
    }
    try {
      const page = await getPatientTreatmentRevisions(
        patientId,
        id,
        more ? (historyCursor ?? undefined) : undefined,
      );
      if (!alive.current || request !== historySequence.current) return;
      setHistory((previous) => (more ? [...previous, ...page.items] : page.items));
      setHistoryCursor(page.next_cursor);
    } catch {
      if (alive.current && request === historySequence.current) setHistoryError(true);
    } finally {
      if (alive.current && request === historySequence.current) setHistoryLoading(false);
    }
  };
  const perform = async (command: DentalAttempt): Promise<boolean> => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setAttempt(command);
    setError(null);
    setLatestTreatment(null);
    try {
      let record: PatientCondition | undefined;
      let treatment: PatientTreatment | undefined;
      if (command.kind === 'apply') record = await createPatientCondition(patientId, command.body);
      else if (command.kind === 'undo')
        await correctPatientCondition(patientId, command.id, command.body);
      else if (command.kind === 'treatment-apply')
        treatment = (await createPatientTreatment(patientId, command.body)).committed;
      else if (command.kind === 'treatment-edit')
        treatment = (await updatePatientTreatment(patientId, command.id, command.body)).committed;
      else
        treatment = (await correctPatientTreatment(patientId, command.id, command.body)).committed;
      if (!alive.current || mountedPatient.current !== patientId) return false;
      setAttempt(null);
      setActiveTool(null);
      setApplied(record ?? null);
      setAppliedTreatment(command.kind === 'treatment-apply' ? (treatment ?? null) : null);
      if (treatment) {
        setTreatments((current) => [treatment, ...current.filter((r) => r.id !== treatment.id)]);
        void refreshTreatments();
      }
      onCommitted(record);
      return true;
    } catch (caught) {
      if (!alive.current || mountedPatient.current !== patientId) return false;
      if (caught instanceof ApiError && [404, 409, 422].includes(caught.status)) {
        if (caught.status === 409 && command.kind.startsWith('treatment-')) {
          const detail = caught.body as { detail?: { latest?: PatientTreatment } };
          setLatestTreatment(detail.detail?.latest ?? null);
        }
        setAttempt(null);
        setError(
          caught.status === 409
            ? 'El registro cambió o ya existe. Consulta el registro y su historial antes de volver a aplicar.'
            : caught.status === 404
              ? 'El registro no está disponible. Actualiza las condiciones.'
              : 'Revisa la pieza y las superficies antes de volver a aplicar.',
        );
        onCommitted();
        if (command.kind.startsWith('treatment-')) void refreshTreatments();
      } else
        setError(
          'No confirmamos la operación. Reintenta con el mismo contenido; descartar no deshace un registro que pudo guardarse.',
        );
      return false;
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const apply = (body: Omit<CreatePatientCondition, 'id'>): Promise<boolean> => {
    if (attempt || locked.current) return Promise.resolve(false);
    return perform({ kind: 'apply', body: { ...body, id: crypto.randomUUID() } });
  };
  const undo = (): Promise<boolean> => {
    if (appliedTreatment && !attempt && !locked.current)
      return perform({
        kind: 'treatment-correct',
        id: appliedTreatment.id,
        body: {
          operation_id: crypto.randomUUID(),
          expected_revision: appliedTreatment.revision,
          reason: 'Deshacer registro',
          replacement: null,
        },
      });
    if (!applied || attempt || locked.current) return Promise.resolve(false);
    return perform({
      kind: 'undo',
      id: applied.id,
      body: {
        operation_id: crypto.randomUUID(),
        expected_revision: applied.revision,
        reason: 'Deshacer registro',
        replacement: null,
      },
    });
  };
  return {
    activeTool,
    selectTool: setActiveTool,
    busy,
    error,
    attempt,
    applied,
    apply,
    undo,
    retry: (): Promise<boolean> => (attempt ? perform(attempt) : Promise.resolve(false)),
    discard: (): void => {
      if (!locked.current) {
        setAttempt(null);
        setError(null);
        setLatestTreatment(null);
        setActiveTool(null);
        onCommitted();
      }
    },
    treatmentCatalog,
    treatmentCatalogError,
    refreshCatalog,
    treatments,
    treatmentLoading,
    treatmentReadError,
    refreshTreatments,
    appliedTreatment,
    latestTreatment,
    applyTreatment: (body): Promise<boolean> =>
      attempt || locked.current
        ? Promise.resolve(false)
        : perform({
            kind: 'treatment-apply',
            body: {
              ...body,
              id: crypto.randomUUID(),
              operation_id: crypto.randomUUID(),
              expected_revision: 0,
            },
          }),
    editTreatment: (record, note, surfaces): Promise<boolean> =>
      attempt || locked.current
        ? Promise.resolve(false)
        : perform({
            kind: 'treatment-edit',
            id: record.id,
            body: {
              operation_id: crypto.randomUUID(),
              expected_revision: record.revision,
              note: note.trim() || null,
              ...(surfaces ? { surfaces } : {}),
            },
          }),
    correctTreatment: (record, reason, replacement): Promise<boolean> =>
      attempt || locked.current
        ? Promise.resolve(false)
        : perform({
            kind: 'treatment-correct',
            id: record.id,
            body: {
              operation_id: crypto.randomUUID(),
              expected_revision: record.revision,
              reason,
              replacement: replacement ? { ...replacement, id: crypto.randomUUID() } : null,
            },
          }),
    history,
    historyError,
    historyLoading,
    historyCursor,
    inspectHistory,
  };
}

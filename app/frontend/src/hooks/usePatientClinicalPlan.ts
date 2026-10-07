import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AddPlanItem,
  ApiError,
  type ClinicalPlan,
  type PlanAction,
  type PlanClosureReason,
  type PlanMetadata,
  type PlanReceipt,
  type PlanRevision,
  type TreatmentCatalog,
  addClinicalPlanItem,
  addClinicalPlanStage,
  correctPatientTreatment,
  createClinicalPlan,
  editClinicalPlan,
  editClinicalPlanStage,
  executeClinicalPlanStage,
  getClinicalPlan,
  getClinicalPlanRevisions,
  getClinicalPlans,
  getTreatmentCatalog,
  reorderClinicalPlan,
  transitionClinicalPlan,
} from '../lib/api';

export const planStateLabels = {
  draft: 'Borrador',
  pending: 'Pendiente de aceptación',
  active: 'En curso',
  completed: 'Completado',
  closed: 'Cerrado',
  archived: 'Archivado',
};

export const planActionLabels: Record<PlanAction, string> = {
  confirm: 'Confirmar plan',
  accept: 'Registrar aceptación',
  reopen: 'Reabrir plan',
  close: 'Cerrar plan',
  reactivate: 'Reactivar plan',
  archive: 'Archivar plan',
};
const stateActions: Record<ClinicalPlan['state'], PlanAction[]> = {
  draft: ['confirm', 'close'],
  pending: ['accept', 'reopen', 'close'],
  active: ['close'],
  completed: ['archive'],
  closed: ['reactivate'],
  archived: [],
};

interface PatientClinicalPlanWorkspace {
  plans: ClinicalPlan[];
  plan: ClinicalPlan | null;
  catalog: TreatmentCatalog | null;
  cursor: string | null;
  total: number;
  loading: boolean;
  busy: boolean;
  error: string | null;
  latest: ClinicalPlan | null;
  history: PlanRevision[] | null;
  historyCursor: string | null;
  editable: boolean;
  uncertain: boolean;
  commits: number;
  actions: PlanAction[];
  load: (next?: string) => Promise<void>;
  open: (id: string) => Promise<void>;
  run: (operation?: () => Promise<PlanReceipt>) => Promise<boolean>;
  create: (metadata: PlanMetadata) => Promise<boolean>;
  edit: (metadata: PlanMetadata) => Promise<boolean>;
  add: (value: Omit<AddPlanItem, 'operation_id' | 'expected_revision' | 'id'>) => Promise<boolean>;
  reorder: (ids: string[]) => Promise<boolean>;
  stage: (
    itemId: string,
    value: { label: string; note: string | null },
    stageId?: string,
  ) => Promise<boolean>;
  executeStage: (
    itemId: string,
    stageId: string | null,
    action: 'complete' | 'cancel',
    text: string | null,
  ) => Promise<boolean>;
  correct: (itemId: string, reason: string) => Promise<boolean>;
  loadHistory: (next?: string) => Promise<void>;
  transition: (
    action: PlanAction,
    note: string | null,
    reason: PlanClosureReason,
  ) => Promise<boolean>;
  discard: () => void;
  back: () => void;
}

export function usePatientClinicalPlan(patientId: string): PatientClinicalPlanWorkspace {
  const [plans, setPlans] = useState<ClinicalPlan[]>([]);
  const [plan, setPlan] = useState<ClinicalPlan | null>(null);
  const [catalog, setCatalog] = useState<TreatmentCatalog | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<ClinicalPlan | null>(null);
  const [history, setHistory] = useState<PlanRevision[] | null>(null);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [commits, setCommits] = useState(0);
  const pending = useRef<(() => Promise<PlanReceipt>) | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const load = useCallback(
    async (next?: string): Promise<void> => {
      const request = ++generation.current;
      setLoading(true);
      setError(null);
      try {
        const [page, registry] = await Promise.all([
          getClinicalPlans(patientId, { cursor: next }),
          getTreatmentCatalog(),
        ]);
        if (generation.current !== request) return;
        setPlans((previous) => (next ? [...previous, ...page.items] : page.items));
        setCursor(page.next_cursor);
        setTotal(page.total);
        setCatalog(registry);
      } catch {
        if (generation.current === request) setError('No pudimos cargar los planes. Reintenta.');
      } finally {
        if (generation.current === request) setLoading(false);
      }
    },
    [patientId],
  );
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  const open = async (id: string): Promise<void> => {
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const snapshot = await getClinicalPlan(patientId, id);
      if (generation.current === request) {
        setPlan(snapshot);
        setHistory(null);
      }
    } catch {
      if (generation.current === request)
        setError('Plan no disponible. Vuelve a cargar los planes.');
    } finally {
      if (generation.current === request) setLoading(false);
    }
  };
  const run = async (operation?: () => Promise<PlanReceipt>): Promise<boolean> => {
    if (inFlight.current || (operation && pending.current)) return false;
    if (operation) pending.current = operation;
    const execute = pending.current;
    if (!execute) return false;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const receipt = await execute();
      setPlan(receipt.committed);
      setCommits((value) => value + 1);
      setPlans((previous) => [
        receipt.committed,
        ...previous.filter((p) => p.id !== receipt.resource_id),
      ]);
      pending.current = null;
      setLatest(null);
      setHistory(null);
      return true;
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        const detail = (caught.body as { detail?: { latest?: ClinicalPlan } } | undefined)?.detail;
        setLatest(detail?.latest ?? null);
        setError(
          'El plan cambió o esta acción no está permitida. Conservamos tu borrador; revisa la versión guardada.',
        );
      } else if (caught instanceof ApiError && (caught.status === 422 || caught.status === 404)) {
        pending.current = null;
        setError(
          caught.status === 404
            ? 'Plan o sesión no disponible. Revisa los planes de este paciente.'
            : 'No se guardó. Revisa las piezas, superficies y sesiones antes de volver a guardar.',
        );
      } else setError('No confirmamos el guardado. Reintenta la misma operación o descártala.');
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const revision = (): { operation_id: string; expected_revision: number } => ({
    operation_id: crypto.randomUUID(),
    expected_revision: plan?.revision ?? 0,
  });
  const create = (metadata: PlanMetadata): Promise<boolean> => {
    const body = { ...revision(), id: crypto.randomUUID(), ...metadata };
    return run(() => createClinicalPlan(patientId, body));
  };
  const edit = (metadata: PlanMetadata): Promise<boolean> => {
    if (!plan) return Promise.resolve(false);
    const id = plan.id;
    const body = { ...revision(), ...metadata };
    return run(() => editClinicalPlan(patientId, id, body));
  };
  const add = (
    value: Omit<AddPlanItem, 'operation_id' | 'expected_revision' | 'id'>,
  ): Promise<boolean> => {
    if (!plan) return Promise.resolve(false);
    const id = plan.id;
    const body = { ...revision(), id: crypto.randomUUID(), ...value };
    return run(() => addClinicalPlanItem(patientId, id, body));
  };
  const reorder = (ids: string[]): Promise<boolean> => {
    if (!plan) return Promise.resolve(false);
    const id = plan.id;
    const body = { ...revision(), item_ids: ids };
    return run(() => reorderClinicalPlan(patientId, id, body));
  };
  const stage = (
    itemId: string,
    value: { label: string; note: string | null },
    stageId?: string,
  ): Promise<boolean> => {
    if (!plan) return Promise.resolve(false);
    const id = plan.id;
    const body = { ...revision(), ...value };
    if (stageId) return run(() => editClinicalPlanStage(patientId, id, itemId, stageId, body));
    const createBody = { ...body, id: crypto.randomUUID() };
    return run(() => addClinicalPlanStage(patientId, id, itemId, createBody));
  };
  const loadHistory = async (next?: string): Promise<void> => {
    if (!plan) return;
    setError(null);
    try {
      const request = generation.current;
      const page = await getClinicalPlanRevisions(patientId, plan.id, next);
      if (generation.current !== request) return;
      setHistory((previous) => (next ? [...(previous ?? []), ...page.items] : page.items));
      setHistoryCursor(page.next_cursor);
    } catch {
      setError('Historial incompleto. Reintenta cargarlo.');
    }
  };
  const executeStage = (
    itemId: string,
    stageId: string | null,
    action: 'complete' | 'cancel',
    text: string | null,
  ): Promise<boolean> => {
    if (!plan) return Promise.resolve(false);
    const item = plan.items.find((i) => i.id === itemId);
    const selected =
      stageId ??
      item?.stages.filter((s) => s.status === 'pending').sort((a, b) => a.sequence - b.sequence)[0]
        ?.id;
    if (!selected) return Promise.resolve(false);
    const id = plan.id;
    const body = revision();
    const command =
      action === 'complete'
        ? { action, body: { ...body, clinical_note_body: text } }
        : { action, body: { ...body, reason: text } };
    return run(() => executeClinicalPlanStage(patientId, id, itemId, selected, command));
  };
  const correct = (itemId: string, reason: string): Promise<boolean> => {
    if (!plan) return Promise.resolve(false);
    const item = plan.items.find((i) => i.id === itemId);
    if (!item) return Promise.resolve(false);
    const body = {
      operation_id: crypto.randomUUID(),
      expected_revision: item.treatment.revision,
      expected_plan_revision: plan.revision,
      reason,
    };
    return run(async () => {
      const receipt = await correctPatientTreatment(patientId, item.treatment_id, body);
      if (!receipt.committed_plan) throw new Error('Missing committed plan receipt');
      return {
        ...receipt,
        resource_id: receipt.committed_plan.id,
        revision: receipt.committed_plan.revision,
        committed: receipt.committed_plan,
      };
    });
  };
  const transition = (
    action: PlanAction,
    note: string | null,
    reason: PlanClosureReason,
  ): Promise<boolean> => {
    if (!plan) return Promise.resolve(false);
    const id = plan.id;
    const body = revision();
    const command =
      action === 'close'
        ? { action, body: { ...body, reason, note } }
        : action === 'accept'
          ? { action, body: { ...body, note } }
          : { action, body };
    return run(() => transitionClinicalPlan(patientId, id, command));
  };
  const discard = (): void => {
    pending.current = null;
    setError(null);
    if (latest) setPlan(latest);
    setLatest(null);
  };
  return {
    plans,
    plan,
    catalog,
    cursor,
    total,
    loading,
    busy,
    error,
    latest,
    history,
    historyCursor,
    load,
    open,
    run,
    create,
    edit,
    add,
    reorder,
    stage,
    executeStage,
    correct,
    loadHistory,
    discard,
    back: () => {
      generation.current++;
      setLoading(false);
      setPlan(null);
      setHistory(null);
    },
    editable: !!plan && ['draft', 'pending', 'active'].includes(plan.state),
    uncertain: pending.current !== null,
    commits,
    transition,
    actions: plan ? stateActions[plan.state] : [],
  };
}

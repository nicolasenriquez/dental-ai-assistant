import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { UNSAFE_DataRouterContext } from 'react-router-dom';
import { useAutosizeTextarea } from '../../hooks/useAutosizeTextarea';
import { useDentalClinicalNotes } from '../../hooks/useDentalClinicalNotes';
import { useDentalWorkspace } from '../../hooks/useDentalWorkspace';
import { useOptionalTransitionGuard } from '../../hooks/useTransitionGuard';
import {
  ApiError,
  type ConditionCatalog,
  type ConditionCorrectionReceipt,
  type CorrectPatientCondition,
  type CreatePatientCondition,
  type DentalNoteContext,
  type Dentition,
  type Patient,
  type PatientCondition,
  type PatientTreatment,
  type ToothSurface,
  type UpdatePatientCondition,
  getConditionCatalog,
  getPatientCondition,
  getPatientConditions,
  getPatientTreatment,
  updatePatientCondition,
} from '../../lib/api';
import { formatClinicalDateShort, formatClinicalTime } from '../../lib/clinicalDate';
import { freezeCorrection, submitCorrection } from '../../lib/conditionCorrection';
import {
  dentalGroups,
  findingPaletteRole,
  normalizeConditionCatalog,
  resolveCondition,
  surfaceDescription,
  treatmentStateLabel,
} from '../../lib/odontogramPresentation';
import { treatmentAnatomy, treatmentMembers } from '../../lib/treatmentAnatomy';
import { PatientIdentity } from '../PatientIdentity';
import { Spinner } from '../Spinner';
import { Button } from '../ui/Button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import { ConditionSymbol } from './ConditionSymbol';
import { DentalClinicalNotes } from './DentalClinicalNotes';
import { DentalConditionModal } from './DentalConditionModal';
import { DentalLegend } from './DentalLegend';
import { PatientActorLabel } from './PatientActorLabel';
import { PatientConditionHistory } from './PatientConditionHistory';
import { PatientDentalNoteDetail } from './PatientDentalNoteDetail';
import { PatientNoteNavigationGuard } from './PatientNoteNavigationGuard';
import { PatientOdontogram } from './PatientOdontogram';
import { ToothDrawing } from './ToothDrawing';
import { ToothInspectionPopover } from './ToothInspectionPopover';
import { TreatmentRecordModal } from './TreatmentRecordModal';
import { TreatmentScopeModal } from './TreatmentScopeModal';
import { TreatmentSymbol } from './TreatmentSymbol';
import { fdiTeeth, toothFamily } from './toothGeometry';

interface ConditionDraft extends CreatePatientCondition {
  correction?: { source: PatientCondition; reason: string; replacement: boolean };
  expectedRevision: number;
  status: 'active' | 'resolved';
  baseline: string;
  base?: { surfaces: string[]; note: string };
}
interface ConflictChoices {
  surfaces?: 'local' | 'current';
  note?: 'local' | 'current';
}
interface PatientDiagnosisProps {
  patientId: string;
  focusedConditionId?: string;
  patient?: Patient;
  onConditionFocus?: (conditionId?: string) => void;
  focusedTreatmentId?: string;
  focusedDentalNoteId?: string;
}
interface ConditionAttempt {
  id: string;
  update?: UpdatePatientCondition;
  correction?: CorrectPatientCondition;
}
const surfaces: { code: ToothSurface; label: string }[] = [
  { code: 'M', label: 'Mesial' },
  { code: 'D', label: 'Distal' },
  { code: 'O', label: 'Oclusal' },
  { code: 'V', label: 'Vestibular' },
  { code: 'L', label: 'Lingual' },
];
function values(draft: CreatePatientCondition & { status: string }): string {
  return JSON.stringify([
    draft.dentition,
    draft.tooth_fdi,
    draft.condition_code,
    draft.surfaces,
    draft.note,
    draft.status,
  ]);
}
function conflictLocalChanged(draft: ConditionDraft, field: 'surfaces' | 'note'): boolean {
  if (!draft.base) return false;
  return field === 'surfaces'
    ? JSON.stringify(draft.surfaces) !== JSON.stringify(draft.base.surfaces)
    : (draft.note ?? '') !== draft.base.note;
}
function conflictCurrentChanged(
  draft: ConditionDraft,
  conflict: PatientCondition,
  field: 'surfaces' | 'note',
): boolean {
  if (!draft.base) return false;
  return field === 'surfaces'
    ? JSON.stringify(conflict.surfaces) !== JSON.stringify(draft.base.surfaces)
    : (conflict.note ?? '') !== draft.base.note;
}

export function PatientDiagnosis({
  patientId,
  focusedConditionId,
  patient,
  onConditionFocus,
  focusedTreatmentId,
  focusedDentalNoteId,
}: PatientDiagnosisProps): JSX.Element {
  return (
    <PatientDiagnosisWorkspace
      key={patientId}
      patientId={patientId}
      focusedConditionId={focusedConditionId}
      patient={patient}
      onConditionFocus={onConditionFocus}
      focusedTreatmentId={focusedTreatmentId}
      focusedDentalNoteId={focusedDentalNoteId}
    />
  );
}

function PatientDiagnosisWorkspace({
  patientId,
  focusedConditionId,
  patient,
  onConditionFocus,
  focusedTreatmentId,
  focusedDentalNoteId,
}: PatientDiagnosisProps): JSX.Element {
  const guard = useOptionalTransitionGuard();
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const [catalog, setCatalog] = useState<ConditionCatalog | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const catalogSequence = useRef(0);
  const [records, setRecords] = useState<PatientCondition[]>([]);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState(false);
  const [dentition, setDentition] = useState<Dentition>('permanent');
  const [noteContext, setNoteContext] = useState<DentalNoteContext>({
    note_type: 'diagnosis',
    entity_kind: 'patient',
    entity_id: patientId,
  });
  const notes = useDentalClinicalNotes(patientId, noteContext);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [notesWidth, setNotesWidth] = useState(0);
  const [notesSheet, setNotesSheet] = useState(false);
  useEffect(() => {
    const element = layoutRef.current;
    if (!element) return;
    const update = (): void => setNotesWidth(element.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [highlightedTooth, setHighlightedTooth] = useState(0);
  const [noteHighlightedTeeth, setNoteHighlightedTeeth] = useState<number[]>([]);
  const [status, setStatus] = useState<'all' | 'active' | 'resolved' | 'entered_in_error'>(
    'active',
  );
  const [focused, setFocused] = useState<PatientCondition | null>(null);
  const [focusError, setFocusError] = useState<string | null>(null);
  const [treatmentFocusError, setTreatmentFocusError] = useState(false);
  const [treatmentReadAttempt, setTreatmentReadAttempt] = useState(0);
  const [draft, setDraft] = useState<ConditionDraft | null>(null);
  const [treatmentEdit, setTreatmentEdit] = useState<PatientTreatment | null>(null);
  const [treatmentDirty, setTreatmentDirty] = useState(false);
  const [scopeReview, setScopeReview] = useState(false);
  const [treatmentSaveAvailable, setTreatmentSaveAvailable] = useState(false);
  const treatmentSaveRef = useRef<(() => Promise<void>) | null>(null);
  const [inspection, setInspection] = useState<{ tooth: number; anchor: HTMLElement } | null>(null);
  const [surfaceSelection, setSurfaceSelection] = useState<{
    tooth: number;
    codes: ToothSurface[];
  } | null>(null);
  const [attempt, setAttempt] = useState<ConditionAttempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<PatientCondition | null>(null);
  const [conflictPending, setConflictPending] = useState(false);
  const [conflictChoices, setConflictChoices] = useState<ConflictChoices>({});
  const [resolveConfirmed, setResolveConfirmed] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [pendingNotes, setPendingNotes] = useState(true);
  const [category, setCategory] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [review, setReview] = useState(false);
  const [receipt, setReceipt] = useState<ConditionCorrectionReceipt | null>(null);
  const [targetRevisionId, setTargetRevisionId] = useState<string | undefined>();
  const [resultReadError, setResultReadError] = useState(false);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const resultTarget = useRef<{ conditionId: string; revisionId?: string | null } | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const sequence = useRef(0);
  const focusSequence = useRef(0);
  const savingRef = useRef(false);
  const routeCancel = useRef<(() => void) | null>(null);
  const initiatingRef = useRef<HTMLElement | null>(null);
  const notesTriggerRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const recordRefs = useRef(new Map<string, HTMLElement>());
  useAutosizeTextarea({
    ref: noteRef,
    value: draft?.note ?? '',
    maxHeight: Math.floor(window.innerHeight / 3),
  });
  const recordDirty =
    !!draft &&
    (!!draft.correction || values(draft) !== draft.baseline || attempt !== null || conflictPending);
  const conflictFieldChoiceNeeded =
    conflictPending && draft && !draft.correction && conflict && draft.base
      ? {
          surfaces: conflictLocalChanged(draft, 'surfaces'),
          note: conflictLocalChanged(draft, 'note'),
        }
      : null;
  const conflictBlocked =
    !!conflictPending &&
    !!draft &&
    !draft.correction &&
    (!conflict ||
      conflict.status !== 'active' ||
      (conflictFieldChoiceNeeded?.surfaces && !conflictChoices.surfaces) ||
      (conflictFieldChoiceNeeded?.note && !conflictChoices.note) ||
      (draft.status === 'resolved' && !resolveConfirmed));
  const locked = saving || attempt !== null;
  const immutable = draft?.expectedRevision !== undefined && !draft.correction;
  const selectedTool = draft ? resolveCondition(catalog, draft.condition_code) : null;
  const applicable =
    !!selectedTool?.supported &&
    selectedTool.allowed_dentitions.includes(draft?.dentition ?? dentition) &&
    !!draft &&
    draft.surfaces.every((surface) => selectedTool.surface_codes.includes(surface));
  const correctionValid =
    !!draft?.correction?.reason.trim() &&
    draft.correction.reason.trim().length <= 1000 &&
    (!draft.correction.replacement ||
      (applicable && fdiTeeth(draft.dentition).includes(draft.tooth_fdi)));
  const labels = Object.fromEntries(
    [
      ...new Set([
        ...(catalog?.conditions.map((item) => item.code) ?? []),
        ...records.map((item) => item.condition_code),
        focused?.condition_code ?? '',
        draft?.condition_code ?? '',
        draft?.correction?.source.condition_code ?? '',
      ]),
    ].map((code) => [code, resolveCondition(catalog, code).label]),
  );
  const loadCatalog = useCallback(async (): Promise<void> => {
    const request = ++catalogSequence.current;
    setCatalogError(false);
    try {
      const vocabulary = normalizeConditionCatalog(await getConditionCatalog());
      if (alive.current && request === catalogSequence.current) setCatalog(vocabulary);
    } catch {
      if (alive.current && request === catalogSequence.current) {
        setCatalog(null);
        setCatalogError(true);
      }
    }
  }, []);
  const load = useCallback(async (): Promise<void> => {
    const request = ++sequence.current;
    setLoading(true);
    setReadError(false);
    try {
      let cursor: string | undefined;
      let all: PatientCondition[] = [];
      do {
        const page = await getPatientConditions(patientId, { cursor, limit: 50, status });
        if (request !== sequence.current) return;
        all = [...all, ...page.items].filter(
          (item, index, items) =>
            items.findIndex((candidate) => candidate.id === item.id) === index,
        );
        setRecords(all);
        cursor = page.next_cursor ?? undefined;
        if (!cursor && all.length !== page.total) throw new Error('Incomplete condition page');
      } while (cursor);
    } catch {
      if (request === sequence.current) setReadError(true);
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [patientId, status]);
  useEffect(() => {
    void loadCatalog();
    return () => {
      catalogSequence.current++;
    };
  }, [loadCatalog]);
  const loadFocused = useCallback(async (): Promise<void> => {
    const request = ++focusSequence.current;
    setFocused(null);
    setFocusError(null);
    if (!focusedConditionId) return;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(focusedConditionId)
    ) {
      setFocusError('No se encontró esta condición');
      return;
    }
    try {
      const current = await getPatientCondition(patientId, focusedConditionId);
      if (request !== focusSequence.current) return;
      setFocused(current);
      setHistoryId(current.id);
      setDentition(current.dentition);
      setStatus(current.status === 'entered_in_error' ? 'all' : current.status);
    } catch (error) {
      if (request === focusSequence.current)
        setFocusError(
          error instanceof ApiError && error.status === 404
            ? 'No se encontró esta condición'
            : 'No pudimos cargar esta condición',
        );
    }
  }, [patientId, focusedConditionId]);
  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);
  const dental = useDentalWorkspace(patientId, (saved) => {
    if (saved) {
      setRecords((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setAnnouncement(
        `Condición guardada: pieza ${saved.tooth_fdi}, ${labels[saved.condition_code]}.`,
      );
    }
    void load();
  });
  const groups = dentalGroups(catalog, dental.treatmentCatalog);
  const activeGroup = groups.find((group) => group.key === category) ?? groups[0];
  const activeVariant = dental.treatmentCatalog?.variants.find((v) => v.id === dental.activeTool);
  const activeSurfaceCodes =
    activeVariant?.surface_codes ??
    resolveCondition(catalog, dental.activeTool ?? '').surface_codes;
  const toolLabel = (code: string): string =>
    dental.treatmentCatalog?.variants.find((v) => v.id === code)?.label_es ?? labels[code] ?? code;
  const currentTreatments = dental.treatments.filter(
    (r) =>
      r.dentition === dentition &&
      (status === 'entered_in_error'
        ? r.state === 'entered_in_error'
        : status === 'resolved'
          ? false
          : status === 'all'
            ? true
            : r.state === 'existing' || r.state === 'performed'),
  );
  const localDirty =
    recordDirty ||
    treatmentDirty ||
    !!surfaceSelection ||
    !!dental.attempt ||
    dental.selectedTeeth.length > 0;
  const dirty = localDirty || notes.dirty;
  const seenNoteCommits = useRef(0);
  useEffect(() => {
    if (notes.commits === seenNoteCommits.current) return;
    seenNoteCommits.current = notes.commits;
    if (!pending || !pendingNotes || localDirty || saving || dental.busy) return;
    const continuation = pending;
    setPending(null);
    guard?.cancelTransition();
    window.requestAnimationFrame(continuation);
  }, [notes.commits, pending, pendingNotes, localDirty, saving, dental.busy, guard]);
  const applyChart = (tooth: number, codes: ToothSurface[]): Promise<boolean> => {
    if (!dental.activeTool) return Promise.resolve(false);
    return activeVariant
      ? dental.applyTreatment({
          variant_id: activeVariant.id,
          dentition,
          teeth: [{ tooth_fdi: tooth, role: 'tooth', surfaces: codes }],
          note: null,
        })
      : dental.apply({
          dentition,
          tooth_fdi: tooth,
          condition_code: dental.activeTool,
          surfaces: codes,
          note: null,
        });
  };
  const openTreatment = (record: PatientTreatment): void => {
    transition(() => {
      initiatingRef.current = inspection?.anchor ?? (document.activeElement as HTMLElement);
      setInspection(null);
      dental.discard();
      setTreatmentEdit(record);
      void dental.inspectHistory(record.id);
    });
  };
  useEffect(() => {
    setTreatmentFocusError(false);
    if (!focusedTreatmentId) return;
    let active = true;
    void getPatientTreatment(patientId, focusedTreatmentId)
      .then((record) => {
        if (!active) return;
        setDentition(record.dentition);
        setTreatmentEdit(record);
        void dental.inspectHistory(record.id);
      })
      .catch(() => {
        if (active) setTreatmentFocusError(true);
      });
    return () => {
      active = false;
    };
  }, [patientId, focusedTreatmentId, treatmentReadAttempt]);
  useEffect(() => {
    if (!dental.activeTool) {
      setSurfaceSelection(null);
      setScopeReview(false);
    }
  }, [dental.activeTool]);
  useEffect(() => {
    void loadFocused();
    return () => {
      focusSequence.current++;
    };
  }, [loadFocused]);
  useEffect(() => {
    if (focused) recordRefs.current.get(focused.id)?.focus();
  }, [focused]);
  useEffect(() => {
    if (draft?.correction) reasonRef.current?.focus();
  }, [draft?.id]);
  const onRouteBlocked = useCallback((proceed: () => void, cancel: () => void): void => {
    routeCancel.current = cancel;
    setPendingNotes(true);
    setPending(() => proceed);
  }, []);
  useEffect(() => {
    if (!dirty && !saving && !dental.busy) return;
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    const remove = guard?.registerBlocker((continuation) => {
      setPendingNotes(true);
      setPending(() => continuation);
      return true;
    });
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      remove?.();
    };
  }, [dirty, saving, dental.busy, guard]);
  const transition = (continuation: () => void, protectNotes = false): void => {
    if (localDirty || saving || dental.busy || (protectNotes && notes.dirty)) {
      setPendingNotes(protectNotes);
      setPending(() => continuation);
    } else continuation();
  };
  const reset = (): void => {
    setTreatmentEdit(null);
    setScopeReview(false);
    setTreatmentDirty(false);
    dental.selectTool(null);
    setInspection(null);
    setHighlightedTooth(0);
    setDraft(null);
    setAttempt(null);
    setSaveError(null);
    setConflict(null);
    setConflictPending(false);
    setConflictChoices({});
    setResolveConfirmed(false);
    setReview(false);
    setRecoveryBlocked(false);
    initiatingRef.current?.focus();
  };
  const publishFocus = (conditionId?: string): void => {
    // Let reset/save remove the router's dirty blocker before publishing confirmed context.
    window.requestAnimationFrame(() => {
      if (alive.current) onConditionFocus?.(conditionId);
    });
  };
  const start = (record: PatientCondition, resolve = false): void => {
    if (dental.busy || dental.attempt) return;
    const trigger = document.activeElement as HTMLElement;
    transition(() => {
      initiatingRef.current = inspection?.anchor ?? trigger;
      setInspection(null);
      dental.selectTool(null);
      setAttempt(null);
      setConflict(null);
      setConflictPending(false);
      setSaveError(null);
      setDentition(record.dentition);
      setDraft({
        ...record,
        correction: undefined,
        note: record.note ?? '',
        status: resolve ? 'resolved' : 'active',
        expectedRevision: record.revision,
        baseline: values({ ...record, note: record.note ?? '' }),
        base: { surfaces: record.surfaces, note: record.note ?? '' },
      });
    });
  };
  const startCorrection = (record: PatientCondition): void => {
    if (dental.busy || dental.attempt) return;
    const trigger = document.activeElement as HTMLElement;
    transition(() => {
      reset();
      initiatingRef.current = trigger;
      setDentition(record.dentition);
      setDraft({
        ...record,
        id: crypto.randomUUID(),
        note: record.note ?? '',
        status: 'active',
        expectedRevision: record.revision,
        baseline: '',
        correction: { source: record, reason: '', replacement: false },
      });
    });
  };
  const activateResult = async (
    conditionId: string | null | undefined,
    revisionId?: string | null,
  ): Promise<void> => {
    if (!conditionId) return;
    const request = ++focusSequence.current;
    resultTarget.current = { conditionId, revisionId };
    setResultReadError(false);
    try {
      const current = await getPatientCondition(patientId, conditionId);
      if (!alive.current || request !== focusSequence.current) return;
      setTargetRevisionId(revisionId ?? undefined);
      setHistoryId(conditionId);
      setFocused(current);
      setDentition(current.dentition);
      setStatus(current.status === 'entered_in_error' ? 'all' : current.status);
      setHighlightedTooth(current.tooth_fdi);
      publishFocus(current.id);
    } catch {
      if (alive.current && request === focusSequence.current) setResultReadError(true);
    }
  };
  const chooseTool = (code: string): void => {
    if (draft || treatmentEdit || locked || dental.busy || dental.attempt) return;
    const variant = dental.treatmentCatalog?.variants.find((v) => v.id === code);
    if (variant) {
      if (!variant.enabled) return;
      transition(() => {
        initiatingRef.current = document.activeElement as HTMLElement;
        setInspection(null);
        setScopeReview(false);
        dental.selectTool(dental.activeTool === code ? null : code);
      });
      return;
    }
    const tool = resolveCondition(catalog, code);
    if (!tool.supported || !tool.allowed_dentitions.includes(dentition)) return;
    transition(() => {
      setInspection(null);
      dental.selectTool(dental.activeTool === code ? null : code);
    });
  };
  const chooseTooth = (tooth: number, anchor?: HTMLElement, surface?: ToothSurface): void => {
    if (!tooth || draft || treatmentEdit || locked || dental.busy || dental.attempt) return;
    if (!dental.activeTool) {
      notes.candidateFromChart(tooth, dentition, true);
      const trigger = anchor;
      if (trigger) setInspection({ tooth, anchor: trigger });
      return;
    }
    const tool = activeVariant
      ? { supported: activeVariant.enabled, ...activeVariant }
      : resolveCondition(catalog, dental.activeTool);
    if (!tool.supported || !tool.allowed_dentitions.includes(dentition)) return;
    setInspection(null);
    if (activeVariant?.scope === 'global_arch') return;
    if (activeVariant?.scope === 'multi_tooth') {
      initiatingRef.current = anchor ?? null;
      dental.selectMember(tooth, dentition);
      return;
    }
    if (tool.surface_codes.length && !surface) {
      initiatingRef.current = anchor ?? null;
      setSurfaceSelection({ tooth, codes: [] });
      return;
    }
    if (surface && !tool.surface_codes.includes(surface)) return;
    void applyChart(tooth, surface ? [surface] : []);
  };
  const save = async (reviewed = false): Promise<boolean> => {
    if (draft?.correction && !attempt && !reviewed) {
      if (
        correctionValid &&
        (!conflictPending || (conflict && conflict.status !== 'entered_in_error'))
      )
        setReview(true);
      return false;
    }
    if (draft?.correction) {
      if (savingRef.current || (!attempt && (!reviewed || !correctionValid))) return false;
      const source = conflict ?? draft.correction.source;
      if (
        !attempt &&
        (recoveryBlocked || (conflictPending && !conflict) || source.status === 'entered_in_error')
      )
        return false;
      const frozen = attempt ?? {
        id: source.id,
        correction: freezeCorrection(
          source.revision,
          {
            id: draft.id,
            dentition: draft.dentition,
            tooth_fdi: draft.tooth_fdi,
            condition_code: draft.condition_code,
            surfaces: draft.surfaces,
            note: draft.note,
            reason: draft.correction.reason,
            replacement: draft.correction.replacement,
          },
          surfaces.map((item) => item.code),
        ),
      };
      if (!frozen.correction) return false;
      setAttempt(frozen);
      setReview(false);
      setSaving(true);
      savingRef.current = true;
      setSaveError(null);
      try {
        const outcome = await submitCorrection(patientId, frozen.id, frozen.correction);
        if (!alive.current) return false;
        if (!outcome.ok) {
          const { failure } = outcome;
          // 'unknown' = response lost: retain the frozen attempt so the
          // retry re-sends the exact same command. Every server-rejected
          // classification invalidates the attempt.
          if (failure.kind !== 'unknown') setAttempt(null);
          if (
            failure.kind === 'revision_conflict' ||
            failure.kind === 'condition_entered_in_error'
          ) {
            setConflictPending(true);
            setConflict(null);
            setSaveError(failure.message);
            try {
              const current = await getPatientCondition(patientId, frozen.id);
              if (alive.current) setConflict(current);
            } catch {
              if (alive.current)
                setSaveError(
                  'No pudimos cargar la versión actual. Reintenta sin perder tus cambios.',
                );
            }
          } else if (failure.kind === 'idempotency_conflict') {
            setRecoveryBlocked(true);
            setConflictPending(true);
            setConflict(null);
            setSaveError(failure.message);
          } else {
            setSaveError(failure.message);
          }
          return false;
        }
        const receipt = outcome.receipt;
        setReceipt(receipt);
        setAnnouncement('Corrección confirmada en ficha.');
        reset();
        setPending(null);
        routeCancel.current?.();
        routeCancel.current = null;
        guard?.cancelTransition();
        void load();
        void activateResult(
          receipt.replacement_condition_id ?? receipt.condition_id,
          receipt.replacement_revision_id ?? receipt.correction_revision_id,
        );
        return true;
      } finally {
        if (alive.current) setSaving(false);
        savingRef.current = false;
      }
    }
    if (
      !draft ||
      savingRef.current ||
      conflictBlocked ||
      !draft.tooth_fdi ||
      !draft.condition_code ||
      (!attempt && draft.status !== 'resolved' && !applicable)
    )
      return false;
    const conflictSource = conflictPending ? conflict : null;
    const keepLocalField = (field: 'surfaces' | 'note'): boolean =>
      conflictLocalChanged(draft, field) &&
      (!conflictFieldChoiceNeeded?.[field] || conflictChoices[field] !== 'current');
    const normalized = {
      id: draft.id,
      dentition: draft.dentition,
      tooth_fdi: draft.tooth_fdi,
      condition_code: draft.condition_code,
      surfaces:
        conflictSource && draft.base
          ? keepLocalField('surfaces')
            ? draft.surfaces
            : conflictSource.surfaces
          : draft.surfaces,
      note:
        conflictSource && draft.base
          ? keepLocalField('note')
            ? draft.note
            : conflictSource.note
          : draft.note,
    };
    const frozen = attempt ?? {
      id: draft.id,
      update: {
        expected_revision: conflictSource ? conflictSource.revision : draft.expectedRevision,
        surfaces: surfaces
          .filter((item) => normalized.surfaces.includes(item.code))
          .map((item) => item.code),
        note: normalized.note?.trim() || null,
        ...(draft.status === 'resolved' && (!conflictSource || resolveConfirmed)
          ? { status: 'resolved' as const }
          : {}),
      },
    };
    setAttempt(frozen);
    setSaveError(null);
    setSaving(true);
    savingRef.current = true;
    try {
      const saved = await updatePatientCondition(
        patientId,
        frozen.id,
        frozen.update as UpdatePatientCondition,
      );
      if (!alive.current) return false;
      setRecords((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setFocused(saved);
      if (saved.status === 'resolved') setStatus('resolved');
      setAnnouncement(
        `Condición guardada: pieza ${saved.tooth_fdi}, ${labels[saved.condition_code] ?? saved.condition_code}, ${saved.status === 'resolved' ? 'resuelta' : 'activa'}.`,
      );
      reset();
      void load();
      const continuation = pending;
      setPending(null);
      guard?.cancelTransition();
      if (continuation) window.requestAnimationFrame(continuation);
      else publishFocus(saved.id);
      return true;
    } catch (error) {
      if (!alive.current) return false;
      if (
        error instanceof ApiError &&
        (error.status === 409 || error.status === 422 || error.status === 404)
      ) {
        setAttempt(null);
        const detail = (error.body as { detail?: { code?: string } })?.detail;
        if (error.status === 409 && detail?.code === 'idempotency_conflict') {
          setConflictPending(true);
          setSaveError(
            'Este intento ya tiene otro contenido guardado. Descarta el intento y actualiza la lista.',
          );
        } else if (error.status === 409) {
          setConflictPending(true);
          setConflictChoices({});
          setResolveConfirmed(false);
          setSaveError(
            'La condición cambió. Conservamos tus cambios. Carga la versión actual antes de continuar.',
          );
          try {
            setConflict(await getPatientCondition(patientId, draft.id));
          } catch {
            setSaveError('No pudimos cargar la versión actual. Reintenta sin perder tus cambios.');
          }
        } else
          setSaveError(
            error.status === 404
              ? 'La condición no está disponible. Conservamos tu borrador.'
              : 'Revisa pieza, condición, superficies y nota (máximo 1000 caracteres).',
          );
      } else
        setSaveError(
          'No confirmamos el guardado. Reintenta con el mismo contenido o descarta el intento y actualiza la lista.',
        );
      return false;
    } finally {
      if (alive.current) setSaving(false);
      savingRef.current = false;
    }
  };
  const discard = (): void => {
    if (pendingNotes) notes.cancel();
    const continuation = pending;
    reset();
    dental.discard();
    setSurfaceSelection(null);
    setPending(null);
    guard?.cancelTransition();
    void load();
    if (continuation) window.requestAnimationFrame(continuation);
  };
  const all = focused ? [focused, ...records.filter((item) => item.id !== focused.id)] : records;
  const visible = all
    .filter((item) => item.dentition === dentition && (status === 'all' || item.status === status))
    .sort(
      (a, b) =>
        a.tooth_fdi - b.tooth_fdi ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    );
  return (
    <div ref={layoutRef} className="flex min-w-0 items-start gap-4">
      <section
        aria-label="Diagnóstico manual"
        onKeyDown={(event) => {
          if (
            event.key === 'Escape' &&
            !draft &&
            !surfaceSelection &&
            !dental.busy &&
            !dental.attempt
          ) {
            dental.selectTool(null);
            setInspection(null);
          }
        }}
        className="min-w-0 flex-1 space-y-5 [container-type:inline-size] [&_button]:min-h-[44px]"
      >
        {dataRouter && (
          <PatientNoteNavigationGuard
            dirty={dirty || saving || dental.busy}
            onBlocked={onRouteBlocked}
          />
        )}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Diagnóstico manual</h2>
            <p className="text-sm text-muted">
              Sin herramienta, consulta la pieza. Con una herramienta, actívala para registrar.
            </p>
          </div>
          {noteContext.note_type !== 'diagnosis' && (
            <Button
              variant="clinicalSecondary"
              onClick={() =>
                transition(() => {
                  notes.cancel();
                  setNoteContext({
                    note_type: 'diagnosis',
                    entity_kind: 'patient',
                    entity_id: patientId,
                  });
                  notes.setOpen(true);
                  setNotesSheet(true);
                }, true)
              }
            >
              Nota de diagnóstico
            </Button>
          )}
        </header>
        <p role="status" className="sr-only">
          {announcement}
        </p>
        {focusedDentalNoteId && (
          <PatientDentalNoteDetail patientId={patientId} noteId={focusedDentalNoteId} />
        )}
        {receipt && (
          <div className="space-y-2 rounded border border-border p-3">
            <p>Corrección guardada.</p>
            <p className="text-sm">
              El original y sus revisiones se conservan. Consulta el resultado exacto del guardado.
            </p>
            <Button
              variant="clinicalSecondary"
              onClick={() =>
                transition(
                  () => void activateResult(receipt.condition_id, receipt.correction_revision_id),
                )
              }
            >
              Ver revisión original corregida
            </Button>
            {receipt.replacement_condition_id && (
              <Button
                variant="clinicalSecondary"
                onClick={() =>
                  transition(
                    () =>
                      void activateResult(
                        receipt.replacement_condition_id,
                        receipt.replacement_revision_id,
                      ),
                  )
                }
              >
                Ver revisión del reemplazo
              </Button>
            )}
            {resultReadError && (
              <p role="alert">
                Corrección guardada; no pudimos actualizar el resultado. Reintenta su lectura con
                los enlaces, sin volver a guardar.
              </p>
            )}
            {readError && (
              <p>
                Corrección guardada; la lista está desactualizada. Reintentar condiciones solo
                repite la lectura.
              </p>
            )}
          </div>
        )}
        {resultReadError && !receipt && (
          <div role="alert">
            <p>No pudimos cargar el registro vinculado. Conservamos la revisión solicitada.</p>
            <Button
              variant="clinicalSecondary"
              onClick={() =>
                void activateResult(
                  resultTarget.current?.conditionId,
                  resultTarget.current?.revisionId,
                )
              }
            >
              Reintentar registro vinculado
            </Button>
          </div>
        )}
        {loading && <p role="status">Cargando condiciones…</p>}
        {catalogError && (
          <div role="alert">
            <p>
              No pudimos cargar el catálogo. Los registros y su historial siguen disponibles; no se
              puede revisar la aplicabilidad de nuevos datos.
            </p>
            <Button variant="clinicalSecondary" onClick={() => void loadCatalog()}>
              Reintentar catálogo
            </Button>
          </div>
        )}
        {readError && (
          <div role="alert">
            <p>
              No pudimos completar la lectura de condiciones. Los datos mostrados pueden estar
              incompletos.
            </p>
            <Button variant="clinicalSecondary" onClick={() => void load()}>
              Reintentar condiciones
            </Button>
          </div>
        )}
        {focusError && (
          <div role="alert">
            <p>{focusError}</p>
            <Button variant="clinicalSecondary" onClick={() => void loadFocused()}>
              Reintentar condición
            </Button>
          </div>
        )}
        {treatmentFocusError && (
          <div role="alert" className="space-y-2 text-error">
            <p>Procedimiento no disponible para este paciente.</p>
            <Button
              variant="clinicalSecondary"
              onClick={() => setTreatmentReadAttempt((value) => value + 1)}
            >
              Reintentar procedimiento
            </Button>
          </div>
        )}
        {activeVariant?.scope === 'multi_tooth' && (
          <div className="space-y-2" aria-label="Selección de varias piezas">
            <div className="flex flex-wrap gap-2">
              {(['range', 'free'] as const).map((mode) => (
                <Button
                  key={mode}
                  variant="clinicalSecondary"
                  aria-pressed={dental.selectionMode === mode}
                  disabled={dental.busy || !!dental.attempt}
                  onClick={() => transition(() => dental.setSelectionMode(mode))}
                >
                  {mode === 'range' ? 'Selección por rango' : 'Selección libre'}
                </Button>
              ))}
            </div>
            <p className="text-sm">
              {dental.selectionMode === 'range'
                ? 'Activa la primera y última pieza del rango.'
                : 'Activa cada pieza para añadirla o retirarla.'}{' '}
              Misma arcada. Seleccionadas: {dental.selectedTeeth.join(', ') || 'ninguna'}.
            </p>
            {dental.selectedTeeth.length > 0 && (
              <Button
                variant="clinicalSecondary"
                disabled={dental.busy || !!dental.attempt}
                onClick={() => dental.clearMembers()}
              >
                Limpiar selección
              </Button>
            )}
            <Button
              variant="clinical"
              disabled={dental.selectedTeeth.length < 2 || dental.busy || !!dental.attempt}
              onClick={() => setScopeReview(true)}
            >
              Revisar selección
            </Button>
          </div>
        )}
        {dental.applied && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 rounded border border-border p-3"
          >
            Guardada en ficha: pieza {dental.applied.tooth_fdi} ·{' '}
            {labels[dental.applied.condition_code]}
            <Button
              variant="clinicalSecondary"
              disabled={dental.busy || !!dental.attempt}
              onClick={() => void dental.undo()}
            >
              Deshacer
            </Button>
          </div>
        )}
        {dental.busy && <p role="status">Guardando…</p>}
        {dental.appliedTreatment && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 rounded border border-border p-3"
          >
            Guardada en ficha: {treatmentAnatomy(dental.appliedTreatment).toLowerCase()} ·{' '}
            {dental.appliedTreatment.label_es}
            <Button
              variant="clinicalSecondary"
              disabled={dental.busy || !!dental.attempt}
              onClick={() => void dental.undo()}
            >
              Deshacer
            </Button>
          </div>
        )}
        {dental.treatmentLoading && <p role="status">Cargando procedimientos…</p>}
        {dental.treatmentReadError && (
          <div role="alert">
            <p>
              Lectura de procedimientos incompleta. Los registros mostrados no son un total
              completo.
            </p>
            <Button variant="clinicalSecondary" onClick={() => void dental.refreshTreatments()}>
              Reintentar procedimientos
            </Button>
          </div>
        )}
        {dental.treatmentCatalogError && (
          <p role="alert">
            Catálogo terapéutico no disponible. Los hallazgos conservan su catálogo.
            <Button variant="clinicalSecondary" onClick={() => void dental.refreshCatalog()}>
              Reintentar catálogo terapéutico
            </Button>
          </p>
        )}
        {dental.error && (
          <div role="alert" className="space-y-2">
            <p>{dental.error}</p>
            {dental.attempt && (
              <>
                <Button
                  variant="clinical"
                  disabled={dental.busy}
                  onClick={() => void dental.retry()}
                >
                  Reintentar operación
                </Button>
                <Button variant="clinicalSecondary" disabled={dental.busy} onClick={dental.discard}>
                  Descartar intento
                </Button>
              </>
            )}
          </div>
        )}
        <div className="space-y-4">
          <div className="min-w-0 space-y-4">
            <PatientOdontogram
              toolIndicator={
                dental.activeTool && (
                  <div className="flex items-center gap-2">
                    <span
                      role="status"
                      aria-label={`Herramienta activa: ${toolLabel(dental.activeTool)}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-sm font-medium text-foreground"
                    >
                      {activeVariant ? (
                        <TreatmentSymbol variant={activeVariant} />
                      ) : (
                        <ConditionSymbol
                          code={resolveCondition(catalog, dental.activeTool).symbol}
                        />
                      )}
                      {toolLabel(dental.activeTool)}
                    </span>
                    <Button
                      variant="clinicalSecondary"
                      disabled={dental.busy || !!dental.attempt}
                      onClick={() => transition(() => dental.selectTool(null))}
                    >
                      Cancelar herramienta
                    </Button>
                  </div>
                )
              }
              controls={
                <div className="flex gap-2" aria-label="Dentición">
                  {(['permanent', 'primary'] as const).map((mode) => (
                    <Button
                      key={mode}
                      variant="clinicalSecondary"
                      aria-pressed={dentition === mode}
                      disabled={
                        saving ||
                        dental.busy ||
                        !!dental.attempt ||
                        draft?.expectedRevision !== undefined
                      }
                      onClick={() => {
                        if (mode !== dentition)
                          transition(() => {
                            reset();
                            dental.selectTool(null);
                            setDentition(mode);
                            notes.clearCandidate();
                          });
                      }}
                    >
                      {mode === 'permanent' ? 'Permanente' : 'Temporal'}
                    </Button>
                  ))}
                </div>
              }
              complete={!loading && !readError}
              dentition={dentition}
              conditions={visible}
              treatments={currentTreatments}
              treatmentCatalog={dental.treatmentCatalog}
              labels={labels}
              catalog={catalog}
              selectedTooth={surfaceSelection?.tooth ?? draft?.tooth_fdi ?? 0}
              selectedTeeth={dental.selectedTeeth}
              highlightedTooth={highlightedTooth}
              highlightedTeeth={[...noteHighlightedTeeth, ...(focused ? [focused.tooth_fdi] : [])]}
              previewTool={dental.activeTool}
              onSelect={chooseTooth}
              surfaceCodes={dental.activeTool ? (activeSurfaceCodes as ToothSurface[]) : []}
              onHighlight={(tooth) => {
                setHighlightedTooth(tooth);
                notes.candidateFromChart(tooth, dentition);
              }}
              disabled={
                dental.busy ||
                !!dental.attempt ||
                locked ||
                immutable ||
                !!surfaceSelection ||
                !!draft ||
                !!treatmentEdit
              }
            />
            <div aria-label="Condiciones disponibles" className="space-y-2">
              {groups.length > 1 ? (
                <div role="group" aria-label="Categorías" className="flex flex-wrap gap-2">
                  {groups.map((group) => (
                    <Button
                      key={group.key}
                      variant="clinicalSecondary"
                      aria-pressed={activeGroup?.key === group.key}
                      className="aria-pressed:border-primary aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:text-foreground"
                      onClick={() => setCategory(group.key)}
                    >
                      {group.label}
                    </Button>
                  ))}
                </div>
              ) : groups.length === 1 ? (
                <h4 className="font-medium">{groups[0].label}</h4>
              ) : null}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
                {activeGroup?.entries.map((tool) => (
                  <Button
                    key={tool.code}
                    aria-label={tool.label_es}
                    aria-describedby={
                      tool.surface_codes.length ? `${patientId}-${tool.code}-surfaces` : undefined
                    }
                    variant="clinicalSecondary"
                    aria-pressed={dental.activeTool === tool.code}
                    className="dental-tool-card relative !min-h-[72px] flex w-full flex-col items-center justify-center gap-1 rounded-lg !border-2 !px-1.5 !py-[7px] text-center aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:font-semibold aria-pressed:text-foreground"
                    disabled={
                      locked ||
                      dental.busy ||
                      !!dental.attempt ||
                      immutable ||
                      !tool.supported ||
                      !tool.allowed_dentitions.includes(dentition) ||
                      !!draft ||
                      !!treatmentEdit
                    }
                    onClick={() => chooseTool(tool.code)}
                  >
                    {dental.treatmentCatalog?.variants.some((v) => v.id === tool.code) ? (
                      <TreatmentSymbol
                        variant={
                          dental.treatmentCatalog.variants.find((v) => v.id === tool.code) ?? {
                            icon_key: tool.symbol,
                            palette_role: 'restoration',
                          }
                        }
                      />
                    ) : (
                      <ConditionSymbol code={tool.symbol} />
                    )}
                    {tool.label_es}
                    {tool.surface_codes.length > 0 && (
                      <span
                        className="dental-sealant absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-current"
                        title="Admite superficies"
                        id={`${patientId}-${tool.code}-surfaces`}
                        aria-label="Admite superficies"
                      />
                    )}
                    {tool.symbolUnavailable && (
                      <span className="sr-only">Símbolo no disponible</span>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          {treatmentEdit && (
            <TreatmentRecordModal
              record={treatmentEdit}
              dental={dental}
              returnFocus={initiatingRef.current}
              suspended={!!pending}
              onDirty={setTreatmentDirty}
              onSaveAvailable={setTreatmentSaveAvailable}
              saveRef={treatmentSaveRef}
              onClose={() =>
                transition(() => {
                  setTreatmentEdit(null);
                  setTreatmentDirty(false);
                  dental.discard();
                })
              }
              onSaved={() => {
                setTreatmentEdit(null);
                setTreatmentDirty(false);
                if (pending) {
                  setPending(null);
                  guard?.cancelTransition();
                  window.requestAnimationFrame(pending);
                }
              }}
            />
          )}
          {draft && (
            <DentalConditionModal
              returnFocus={initiatingRef.current}
              label={
                draft.correction
                  ? 'Corregir registro'
                  : draft.status === 'resolved'
                    ? 'Resolver condición'
                    : 'Editar condición'
              }
              suspended={!!pending || review}
              onClose={() => {
                if (!saving) transition(reset);
              }}
            >
              <form
                className="space-y-3 rounded border border-border bg-surface p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    transition(reset);
                  }
                }}
              >
                <h3 className="font-semibold">
                  {draft.correction
                    ? 'Corregir registro'
                    : draft.status === 'resolved'
                      ? 'Resolver condición'
                      : 'Editar condición'}
                </h3>
                {draft.correction && (
                  <>
                    <p>
                      Original: pieza {draft.correction.source.tooth_fdi} ·{' '}
                      {labels[draft.correction.source.condition_code] ??
                        draft.correction.source.condition_code}{' '}
                      · {conditionStatus(draft.correction.source.status)} · Revisión{' '}
                      {draft.correction.source.revision}
                    </p>
                    <p>
                      Se marcará como registrado por error, no como resuelto. Su historial se
                      conserva.
                    </p>
                    <label className="block text-sm" htmlFor="correction-reason">
                      Motivo de corrección
                    </label>
                    <textarea
                      id="correction-reason"
                      ref={reasonRef}
                      className="min-h-24 w-full rounded border border-border bg-surface p-3 text-base"
                      maxLength={1000}
                      disabled={locked}
                      value={draft.correction.reason}
                      onChange={(event) => {
                        if (!draft.correction) return;
                        setDraft({
                          ...draft,
                          correction: { ...draft.correction, reason: event.target.value },
                        });
                      }}
                    />
                    <label className="flex min-h-[44px] items-center gap-2">
                      <input
                        type="checkbox"
                        disabled={locked}
                        checked={draft.correction.replacement}
                        onChange={(event) => {
                          if (!draft.correction) return;
                          setDraft({
                            ...draft,
                            correction: { ...draft.correction, replacement: event.target.checked },
                          });
                        }}
                      />
                      Crear registro de reemplazo
                    </label>
                    {draft.correction.replacement && (
                      <>
                        <label htmlFor="replacement-dentition" className="block text-sm">
                          Dentición del reemplazo
                        </label>
                        <select
                          id="replacement-dentition"
                          disabled={locked}
                          value={draft.dentition}
                          className="min-h-[44px] w-full rounded border border-border bg-surface p-2"
                          onChange={(event) => {
                            const mode = event.target.value as Dentition;
                            setDentition(mode);
                            setDraft({ ...draft, dentition: mode, tooth_fdi: 0 });
                          }}
                        >
                          <option value="permanent">Permanente</option>
                          <option value="primary">Temporal</option>
                        </select>
                        <label htmlFor="replacement-tooth" className="block text-sm">
                          Pieza FDI del reemplazo
                        </label>
                        <select
                          id="replacement-tooth"
                          disabled={locked}
                          value={draft.tooth_fdi || ''}
                          className="min-h-[44px] w-full rounded border border-border bg-surface p-2"
                          onChange={(event) =>
                            setDraft({ ...draft, tooth_fdi: Number(event.target.value) })
                          }
                        >
                          <option value="">Selecciona una pieza</option>
                          {fdiTeeth(draft.dentition).map((tooth) => (
                            <option key={tooth} value={tooth}>
                              Pieza {tooth}
                            </option>
                          ))}
                        </select>
                        <label htmlFor="replacement-condition" className="block text-sm">
                          Condición del reemplazo
                        </label>
                        <select
                          id="replacement-condition"
                          disabled={locked}
                          value={draft.condition_code}
                          className="min-h-[44px] w-full rounded border border-border bg-surface p-2"
                          onChange={(event) => {
                            const tool = resolveCondition(catalog, event.target.value);
                            setDraft({
                              ...draft,
                              condition_code: tool.code,
                              surfaces: draft.surfaces.filter((code) =>
                                tool.surface_codes.includes(code),
                              ),
                            });
                          }}
                        >
                          <option value="">Selecciona condición</option>
                          {catalog?.conditions.map((entry) => (
                            <option
                              key={entry.code}
                              value={entry.code}
                              disabled={
                                !resolveCondition(catalog, entry.code).allowed_dentitions.includes(
                                  draft.dentition,
                                )
                              }
                            >
                              {entry.label_es}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </>
                )}
                {(!draft.correction || draft.correction.replacement) && (
                  <>
                    {dirty && !saving && !attempt && (
                      <p className="text-sm text-muted">Borrador sin guardar</p>
                    )}
                    {draft.status === 'resolved' && (
                      <p>
                        Al guardar se marcará como resuelta. El registro y su historial se
                        conservan.
                      </p>
                    )}
                    {draft.tooth_fdi > 0 && (
                      <svg
                        aria-label={`Pieza seleccionada ${draft.tooth_fdi}`}
                        role="img"
                        viewBox="0 0 42 122"
                        className="mx-auto h-40 w-28 [@container(max-width:1063px)]:h-24 text-muted"
                      >
                        <ToothDrawing tooth={draft.tooth_fdi} surfaces={draft.surfaces} />
                      </svg>
                    )}
                    <p className="text-sm">
                      Pieza {draft.tooth_fdi || 'sin seleccionar'} ·{' '}
                      {labels[draft.condition_code] ?? 'Selecciona condición'} ·{' '}
                      {dentition === 'permanent' ? 'Permanente' : 'Temporal'}
                    </p>
                    {selectedTool?.supported &&
                      (selectedTool.surface_codes.length ? (
                        <fieldset disabled={locked || draft.status === 'resolved'}>
                          <legend className="text-sm font-medium">Superficies</legend>
                          <div className="flex flex-wrap gap-2">
                            {surfaces.map((item) => (
                              <label
                                key={item.code}
                                className="flex min-h-[44px] items-center gap-2 rounded border border-border px-3"
                              >
                                <input
                                  type="checkbox"
                                  checked={draft.surfaces.includes(item.code)}
                                  onChange={(event) =>
                                    setDraft({
                                      ...draft,
                                      surfaces: event.target.checked
                                        ? [...draft.surfaces, item.code]
                                        : draft.surfaces.filter((code) => code !== item.code),
                                    })
                                  }
                                />
                                {item.label} ({item.code})
                              </label>
                            ))}
                          </div>
                          {draft.surfaces.length === 0 && (
                            <p className="text-xs text-muted">Sin superficies especificadas</p>
                          )}
                        </fieldset>
                      ) : (
                        <p className="text-sm">Pieza completa, sin superficies</p>
                      ))}
                    <label className="block text-sm" htmlFor="condition-note">
                      Nota de condición
                    </label>
                    <textarea
                      id="condition-note"
                      ref={noteRef}
                      className="min-h-[calc(4lh+1.5rem+2px)] max-h-[33dvh] w-full rounded border border-border bg-surface p-3 [field-sizing:content]"
                      maxLength={1000}
                      value={draft.note ?? ''}
                      disabled={locked || draft.status === 'resolved'}
                      onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                    />
                  </>
                )}
                {saveError && (
                  <p role="alert" className="text-error">
                    {saveError}
                  </p>
                )}
                {conflictPending && (
                  <div className="space-y-2">
                    <p>
                      {conflict
                        ? `Versión actual: ${conflict.revision}`
                        : 'Versión actual no disponible'}
                    </p>
                    {conflict && <p>Estado actual: {conditionStatus(conflict.status)}</p>}
                    <Button
                      type="button"
                      variant="clinicalSecondary"
                      onClick={() => {
                        setConflict(null);
                        setConflictChoices({});
                        setResolveConfirmed(false);
                        void getPatientCondition(patientId, draft.correction?.source.id ?? draft.id)
                          .then((current) => {
                            if (alive.current) setConflict(current);
                          })
                          .catch(() =>
                            setSaveError('No pudimos cargar la versión actual. Reintenta.'),
                          );
                      }}
                    >
                      Cargar versión actual
                    </Button>
                    {conflict &&
                      draft.base &&
                      !draft.correction &&
                      conflict.status === 'active' && (
                        <>
                          {draft.status === 'resolved' && (
                            <label className="flex min-h-[44px] items-center gap-2">
                              <input
                                type="checkbox"
                                checked={resolveConfirmed}
                                onChange={(event) => setResolveConfirmed(event.target.checked)}
                              />
                              Confirmar resolución sobre la versión actual
                            </label>
                          )}
                          {(conflictLocalChanged(draft, 'surfaces') ||
                            conflictCurrentChanged(draft, conflict, 'surfaces')) && (
                            <div className="space-y-1">
                              <p className="text-sm">
                                Superficies — Base:{' '}
                                {draft.base.surfaces.join(', ') || 'Sin superficies'} · Tuyas:{' '}
                                {draft.surfaces.join(', ') || 'Sin superficies'} · Actuales:{' '}
                                {conflict.surfaces.join(', ') || 'Sin superficies'}
                              </p>
                              {conflictFieldChoiceNeeded?.surfaces && (
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    variant="clinicalSecondary"
                                    aria-pressed={conflictChoices.surfaces === 'local'}
                                    onClick={() =>
                                      setConflictChoices({ ...conflictChoices, surfaces: 'local' })
                                    }
                                  >
                                    Mantener mis superficies
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="clinicalSecondary"
                                    aria-pressed={conflictChoices.surfaces === 'current'}
                                    onClick={() =>
                                      setConflictChoices({
                                        ...conflictChoices,
                                        surfaces: 'current',
                                      })
                                    }
                                  >
                                    Usar superficies actuales
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                          {(conflictLocalChanged(draft, 'note') ||
                            conflictCurrentChanged(draft, conflict, 'note')) && (
                            <div className="space-y-1">
                              <p className="whitespace-pre-wrap break-words text-sm">
                                Nota — Base: {draft.base.note || 'Sin nota'} · Tuya:{' '}
                                {draft.note || 'Sin nota'} · Actual: {conflict.note || 'Sin nota'}
                              </p>
                              {conflictFieldChoiceNeeded?.note && (
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    variant="clinicalSecondary"
                                    aria-pressed={conflictChoices.note === 'local'}
                                    onClick={() =>
                                      setConflictChoices({ ...conflictChoices, note: 'local' })
                                    }
                                  >
                                    Mantener mi nota
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="clinicalSecondary"
                                    aria-pressed={conflictChoices.note === 'current'}
                                    onClick={() =>
                                      setConflictChoices({ ...conflictChoices, note: 'current' })
                                    }
                                  >
                                    Usar nota actual
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    {conflict && !draft.correction && conflict.status !== 'active' && (
                      <p>
                        Este registro ya está{' '}
                        {conflict.status === 'resolved' ? 'resuelto' : 'registrado por error'} en la
                        versión actual. No puede editarse; consulta su historial o descarta el
                        borrador.
                      </p>
                    )}
                    {conflict && !draft.correction && (
                      <Button
                        type="button"
                        variant="clinicalSecondary"
                        onClick={() => {
                          reset();
                          setFocused(conflict);
                          publishFocus(conflict.id);
                          void load();
                        }}
                      >
                        Usar versión actual
                      </Button>
                    )}
                    {draft.correction && conflict?.status === 'entered_in_error' && (
                      <p>
                        El original ya está registrado por error. Consulta su historial o descarta
                        el borrador; no puede corregirse de nuevo.
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="clinicalSecondary"
                    disabled={saving}
                    onClick={() => transition(reset)}
                  >
                    Cancelar condición
                  </Button>
                  <Button
                    type="submit"
                    variant="clinical"
                    aria-busy={saving}
                    className="inline-flex w-[220px] max-w-full items-center justify-center gap-2"
                    disabled={
                      saving ||
                      (draft.correction
                        ? !attempt &&
                          (!correctionValid ||
                            (conflictPending &&
                              (!conflict || conflict.status === 'entered_in_error')))
                        : !attempt &&
                          (conflictBlocked ||
                            !draft.tooth_fdi ||
                            !draft.condition_code ||
                            (draft.status !== 'resolved' && !applicable)))
                    }
                  >
                    {saving && !pending && <Spinner />}
                    {saving
                      ? 'Guardando…'
                      : draft.correction
                        ? attempt
                          ? 'Reintentar corrección'
                          : conflictPending
                            ? 'Revisar nueva corrección'
                            : 'Revisar corrección'
                        : attempt
                          ? 'Reintentar guardado'
                          : 'Guardar condición'}
                  </Button>
                </div>
              </form>
            </DentalConditionModal>
          )}
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-semibold">
                Condiciones por pieza
                {!loading &&
                  !readError &&
                  !dental.treatmentLoading &&
                  !dental.treatmentReadError && (
                    <span
                      aria-label={`${visible.length + currentTreatments.length} registros guardados en esta dentición y estado`}
                      className="rounded bg-surface px-2 py-0.5 text-xs text-muted"
                    >
                      {visible.length + currentTreatments.length}
                    </span>
                  )}
              </h3>
              <label className="text-sm">
                Estado{' '}
                <select
                  className="min-h-[44px] rounded border border-border bg-surface px-2"
                  value={status}
                  onChange={(event) => {
                    const next = event.target.value as typeof status;
                    transition(() => {
                      reset();
                      setStatus(next);
                    });
                  }}
                >
                  <option value="all">Historial completo</option>
                  <option value="active">Actuales</option>
                  <option value="resolved">Resueltas</option>
                </select>
              </label>
            </div>
            {!loading &&
              !readError &&
              !dental.treatmentLoading &&
              !dental.treatmentReadError &&
              visible.length === 0 &&
              currentTreatments.length === 0 && (
                <p className="text-muted">
                  {status === 'active'
                    ? 'Sin registros actuales'
                    : 'Sin condiciones en esta dentición y estado.'}
                </p>
              )}
            {visible.length + currentTreatments.length > 0 && (
              <p className="text-sm text-muted">
                {loading || readError || dental.treatmentLoading || dental.treatmentReadError
                  ? 'Lectura incompleta · '
                  : ''}
                {visible.length + currentTreatments.length} registros en{' '}
                {
                  new Set([
                    ...visible.map((r) => r.tooth_fdi),
                    ...currentTreatments.flatMap((r) => r.teeth.map((m) => m.tooth_fdi)),
                  ]).size
                }{' '}
                piezas
                {currentTreatments.some((r) => r.arch) &&
                  ` · ${new Set(currentTreatments.filter((r) => r.arch).map((r) => r.arch)).size} arcadas`}
                {loading || readError || dental.treatmentLoading || dental.treatmentReadError
                  ? '; no es un total completo'
                  : ''}
              </p>
            )}
            <DentalLegend catalog={catalog} treatments={dental.treatmentCatalog} />
            <ol className="divide-y divide-border">
              {[...visible, ...currentTreatments]
                .sort(
                  (a, b) =>
                    ('condition_code' in a
                      ? a.tooth_fdi
                      : (a.teeth[0]?.tooth_fdi ?? (a.arch === 'upper' ? 100 : 101))) -
                    ('condition_code' in b
                      ? b.tooth_fdi
                      : (b.teeth[0]?.tooth_fdi ?? (b.arch === 'upper' ? 100 : 101))),
                )
                .map((record, index, ordered) => (
                  <li key={record.id}>
                    {(index === 0 || recordGroup(record) !== recordGroup(ordered[index - 1])) && (
                      <h4 className="pt-3 font-semibold">
                        <span className="inline-flex rounded bg-surface px-2 py-1 text-sm">
                          {recordGroup(record)}
                        </span>
                      </h4>
                    )}
                    {'condition_code' in record ? (
                      <>
                        <article
                          tabIndex={-1}
                          onMouseEnter={() => setHighlightedTooth(record.tooth_fdi)}
                          onMouseLeave={() => setHighlightedTooth(0)}
                          onFocus={() => setHighlightedTooth(record.tooth_fdi)}
                          onBlur={() => setHighlightedTooth(0)}
                          ref={(node) => {
                            if (node) recordRefs.current.set(record.id, node);
                            else recordRefs.current.delete(record.id);
                          }}
                          aria-label={`Pieza ${record.tooth_fdi} · ${labels[record.condition_code] ?? record.condition_code} · ${conditionStatus(record.status)}`}
                          className={`space-y-2 rounded px-2 py-3 focus-visible:ring-2 focus-visible:ring-primary ${highlightedTooth === record.tooth_fdi ? 'bg-surface' : ''}`}
                        >
                          <h4 className="flex items-center gap-2 font-medium">
                            <ConditionSymbol
                              code={resolveCondition(catalog, record.condition_code).symbol}
                              resolved={record.status === 'resolved'}
                              error={record.status === 'entered_in_error'}
                            />
                            {labels[record.condition_code] ?? record.condition_code}
                          </h4>
                          <p className="text-sm">
                            {conditionStatus(record.status)} ·{' '}
                            {surfaceDescription(catalog, record.condition_code, record.surfaces)}
                          </p>
                          {resolveCondition(catalog, record.condition_code).symbolUnavailable && (
                            <p className="text-sm text-muted">Símbolo no disponible</p>
                          )}
                          {record.note && (
                            <p className="whitespace-pre-wrap break-words text-sm">{record.note}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                            <PatientActorLabel
                              compact
                              actor={record.updated_by}
                              actors={visible.map((item) => item.updated_by)}
                            />
                            <p>
                              {formatClinicalDateShort(record.updated_at)}{' '}
                              {formatClinicalTime(record.updated_at)} · Revisión {record.revision}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {record.correction && (
                              <>
                                <p className="w-full whitespace-pre-wrap break-words">
                                  Motivo de corrección: {record.correction.reason}
                                </p>
                                <Button
                                  variant="clinicalSecondary"
                                  onClick={() =>
                                    transition(
                                      () =>
                                        void activateResult(
                                          record.id,
                                          record.correction?.correction_revision_id,
                                        ),
                                    )
                                  }
                                >
                                  Ver corrección exacta
                                </Button>
                                {record.correction.replacement_condition_id && (
                                  <Button
                                    variant="clinicalSecondary"
                                    onClick={() =>
                                      transition(
                                        () =>
                                          void activateResult(
                                            record.correction?.replacement_condition_id,
                                            record.correction?.replacement_revision_id,
                                          ),
                                      )
                                    }
                                  >
                                    Ver reemplazo vinculado
                                  </Button>
                                )}
                              </>
                            )}
                            {record.supersedes_condition_id && (
                              <Button
                                variant="clinicalSecondary"
                                onClick={() =>
                                  transition(
                                    () => void activateResult(record.supersedes_condition_id),
                                  )
                                }
                              >
                                Ver registro original
                              </Button>
                            )}
                            {record.status !== 'entered_in_error' && (
                              <Button
                                variant="clinicalSecondary"
                                disabled={saving}
                                onClick={() => startCorrection(record)}
                              >
                                Corregir registro
                              </Button>
                            )}
                            {record.status === 'active' && (
                              <>
                                <Button
                                  variant="clinicalSecondary"
                                  disabled={
                                    saving ||
                                    !resolveCondition(catalog, record.condition_code).supported
                                  }
                                  onClick={() => start(record)}
                                >
                                  Editar condición
                                </Button>
                                <Button
                                  variant="clinicalSecondary"
                                  disabled={saving}
                                  onClick={() => start(record, true)}
                                >
                                  Resolver condición
                                </Button>
                              </>
                            )}
                            <Button
                              variant="clinicalSecondary"
                              onClick={() =>
                                transition(() => {
                                  const next = historyId === record.id ? null : record.id;
                                  setTargetRevisionId(undefined);
                                  setHistoryId(next);
                                  setFocused(next ? record : null);
                                  publishFocus(next ?? undefined);
                                })
                              }
                            >
                              Historial de condición
                            </Button>
                          </div>
                          {historyId === record.id && (
                            <PatientConditionHistory
                              key={`${record.id}:${record.revision}`}
                              patientId={patientId}
                              conditionId={record.id}
                              labels={labels}
                              catalog={catalog}
                              targetRevisionId={targetRevisionId}
                            />
                          )}
                        </article>
                      </>
                    ) : (
                      <article
                        className="space-y-2 rounded px-2 py-3"
                        aria-label={`${treatmentAnatomy(record)} · ${record.label_es} · ${treatmentStateLabel(record.state)}`}
                        onMouseEnter={() =>
                          setNoteHighlightedTeeth(record.teeth.map((member) => member.tooth_fdi))
                        }
                        onMouseLeave={() => setNoteHighlightedTeeth([])}
                        onFocus={() =>
                          setNoteHighlightedTeeth(record.teeth.map((member) => member.tooth_fdi))
                        }
                        onBlur={() => setNoteHighlightedTeeth([])}
                      >
                        <h4 className="flex items-center gap-2 font-medium">
                          <TreatmentSymbol
                            variant={
                              dental.treatmentCatalog?.variants.find(
                                (v) => v.id === record.variant_id,
                              ) ?? { icon_key: record.clinical_type, palette_role: 'restoration' }
                            }
                          />
                          {record.label_es}
                        </h4>
                        <p>
                          {treatmentStateLabel(record.state)} · {treatmentMembers(record)}
                        </p>
                        {record.note && (
                          <p className="whitespace-pre-wrap break-words">{record.note}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                          <PatientActorLabel
                            compact
                            actor={record.updated_by}
                            actors={currentTreatments.map((r) => r.updated_by)}
                          />
                          <p>
                            {formatClinicalDateShort(record.updated_at)}{' '}
                            {formatClinicalTime(record.updated_at)} · Revisión {record.revision}
                          </p>
                        </div>
                        <Button variant="clinicalSecondary" onClick={() => openTreatment(record)}>
                          Editar / Historial de procedimiento
                        </Button>
                        <Button
                          variant="clinicalSecondary"
                          onClick={() =>
                            transition(() => {
                              notes.cancel();
                              setNoteContext({
                                note_type: 'treatment',
                                entity_kind: 'treatment',
                                entity_id: record.id,
                              });
                              notes.setOpen(true);
                              setNotesSheet(true);
                            }, true)
                          }
                        >
                          Nota del tratamiento
                        </Button>
                      </article>
                    )}
                  </li>
                ))}
            </ol>
          </div>
        </div>
        {inspection &&
          !notes.deleting &&
          !(notesWidth < 1160 && notesSheet) &&
          !draft &&
          !surfaceSelection &&
          !scopeReview &&
          activeVariant?.scope !== 'global_arch' && (
            <ToothInspectionPopover
              tooth={inspection.tooth}
              anchor={inspection.anchor}
              onClose={() => setInspection(null)}
            >
              <p className="mt-2 text-sm text-muted">Registros existentes</p>
              <p className="text-sm">
                {
                  { incisor: 'Incisivo', canine: 'Canino', premolar: 'Premolar', molar: 'Molar' }[
                    toothFamily(inspection.tooth)
                  ]
                }{' '}
                · {dentition === 'permanent' ? 'Permanente' : 'Temporal'}
              </p>
              {loading || readError ? <p>Lectura incompleta. Reintenta las condiciones.</p> : null}
              {!loading &&
                !readError &&
                !all.some(
                  (item) => item.tooth_fdi === inspection.tooth && item.dentition === dentition,
                ) && <p className="text-sm">Sin condiciones guardadas</p>}
              {all
                .filter(
                  (item) => item.tooth_fdi === inspection.tooth && item.dentition === dentition,
                )
                .map((record) => (
                  <div key={record.id} className="mt-2 border-t border-border pt-2 text-sm">
                    <p className="flex items-center gap-2">
                      <ConditionSymbol
                        code={resolveCondition(catalog, record.condition_code).symbol}
                      />
                      {labels[record.condition_code]} · {conditionStatus(record.status)}
                    </p>
                    <p>{surfaceDescription(catalog, record.condition_code, record.surfaces)}</p>
                    <div className="flex flex-wrap gap-2">
                      {record.status === 'active' && (
                        <Button
                          variant="clinicalSecondary"
                          disabled={!resolveCondition(catalog, record.condition_code).supported}
                          onClick={() => start(record)}
                        >
                          Editar
                        </Button>
                      )}
                      <Button
                        variant="clinicalSecondary"
                        onClick={() => {
                          setInspection(null);
                          setHistoryId(record.id);
                          setFocused(record);
                          publishFocus(record.id);
                        }}
                      >
                        Historial
                      </Button>
                    </div>
                  </div>
                ))}
              {currentTreatments
                .filter((r) => r.teeth.some((m) => m.tooth_fdi === inspection.tooth))
                .map((record) => (
                  <div key={record.id} className="mt-2 border-t border-border pt-2 text-sm">
                    <p>
                      {record.label_es} · {treatmentStateLabel(record.state)}
                    </p>
                    <p>
                      {record.teeth
                        .find((m) => m.tooth_fdi === inspection.tooth)
                        ?.surfaces.join(', ') || 'Pieza completa'}
                    </p>
                    <Button variant="clinicalSecondary" onClick={() => openTreatment(record)}>
                      Editar / Historial
                    </Button>
                  </div>
                ))}
              <Button
                variant="clinicalSecondary"
                onClick={() => {
                  setInspection(null);
                  document
                    .querySelector<HTMLElement>('[aria-label="Condiciones disponibles"] button')
                    ?.focus({ preventScroll: true });
                }}
              >
                Registrar
              </Button>
              <Button
                variant="clinicalSecondary"
                onClick={() => {
                  const anchor = inspection.anchor;
                  setInspection(null);
                  anchor.focus({ preventScroll: true });
                }}
              >
                Cerrar pieza
              </Button>
            </ToothInspectionPopover>
          )}
        {activeVariant && (scopeReview || activeVariant.scope === 'global_arch') && (
          <TreatmentScopeModal
            key={activeVariant.id}
            variant={activeVariant}
            dentition={dentition}
            dental={dental}
            returnFocus={initiatingRef.current}
            suspended={!!pending}
            onClose={() => {
              transition(() => {
                setScopeReview(false);
                dental.discard();
              });
            }}
          />
        )}
        {surfaceSelection && dental.activeTool && (
          <DentalConditionModal
            returnFocus={initiatingRef.current}
            label="Seleccionar superficies"
            suspended={!!pending}
            onClose={() => {
              if (!dental.busy && !dental.attempt) {
                setSurfaceSelection(null);
                dental.selectTool(null);
              }
            }}
          >
            <h3 className="font-semibold">Seleccionar superficies</h3>
            <p>
              Pieza {surfaceSelection.tooth} · {toolLabel(dental.activeTool)}
            </p>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="rounded-lg bg-surface-raised p-3">
                <p className="mb-2 text-center text-xs text-muted">Vista oclusal</p>
                <svg
                  role="img"
                  aria-label={`Vista oclusal de pieza ${surfaceSelection.tooth}`}
                  viewBox="0 92 42 32"
                  className="mx-auto h-32 w-full max-w-40 text-muted"
                >
                  <ToothDrawing
                    tooth={surfaceSelection.tooth}
                    surfaces={surfaceSelection.codes}
                    view="occlusal"
                    surfaceClassName={`dental-${activeVariant?.layer_role ?? findingPaletteRole(dental.activeTool)} fill-current`}
                  />
                </svg>
              </div>
              <div className="rounded-lg bg-surface-raised p-3">
                <p className="mb-2 text-center text-xs text-muted">Vista lateral</p>
                <svg
                  role="img"
                  aria-label={`Superficies de pieza ${surfaceSelection.tooth}`}
                  viewBox="-4 -4 50 102"
                  className="mx-auto h-32 w-full max-w-40 text-muted"
                >
                  <ToothDrawing tooth={surfaceSelection.tooth} view="lateral" />
                </svg>
              </div>
            </div>
            <fieldset disabled={dental.busy || !!dental.attempt}>
              <legend>Superficies</legend>
              <div className="flex flex-wrap gap-2">
                {surfaces
                  .filter((item) => activeSurfaceCodes.includes(item.code))
                  .map((item) => (
                    <label
                      key={item.code}
                      className="flex min-h-11 items-center gap-2 rounded border border-border p-2"
                    >
                      <input
                        type="checkbox"
                        checked={surfaceSelection.codes.includes(item.code)}
                        onChange={(event) =>
                          setSurfaceSelection({
                            ...surfaceSelection,
                            codes: event.target.checked
                              ? [...surfaceSelection.codes, item.code]
                              : surfaceSelection.codes.filter((code) => code !== item.code),
                          })
                        }
                      />
                      {item.label} ({item.code})
                    </label>
                  ))}
              </div>
            </fieldset>
            {dental.error && <p role="alert">{dental.error}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="clinicalSecondary"
                disabled={dental.busy || !!dental.attempt}
                onClick={() => {
                  setSurfaceSelection(null);
                  dental.selectTool(null);
                }}
              >
                Cancelar superficies
              </Button>
              <Button
                variant="clinical"
                disabled={dental.busy || !!dental.attempt || !surfaceSelection.codes.length}
                onClick={async () => {
                  if (!dental.activeTool) return;
                  const saved = await applyChart(
                    surfaceSelection.tooth,
                    surfaces
                      .filter((item) => surfaceSelection.codes.includes(item.code))
                      .map((item) => item.code),
                  );
                  if (saved) setSurfaceSelection(null);
                }}
              >
                Confirmar
              </Button>
              {dental.attempt && (
                <Button
                  variant="clinicalSecondary"
                  disabled={dental.busy}
                  onClick={() => {
                    dental.discard();
                    setSurfaceSelection(null);
                  }}
                >
                  Descartar intento
                </Button>
              )}
              {dental.attempt && (
                <Button
                  variant="clinical"
                  disabled={dental.busy}
                  onClick={async () => {
                    if (await dental.retry()) setSurfaceSelection(null);
                  }}
                >
                  Reintentar operación
                </Button>
              )}
            </div>
          </DentalConditionModal>
        )}
        {review && draft?.correction && (
          <AlertDialog open onOpenChange={setReview}>
            <AlertDialogContent className="max-h-[calc(100dvh-32px)] overflow-y-auto break-words [&>*]:shrink-0 [&_button]:min-h-[44px]">
              <AlertDialogHeader>
                <AlertDialogTitle>Revisar corrección</AlertDialogTitle>
                <AlertDialogDescription>
                  Paciente de la ficha abierta. Confirma el registro original y la consecuencia
                  antes de guardar.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {patient && <PatientIdentity patient={patient} />}
              <p>
                Original: Pieza {draft.correction.source.tooth_fdi} ·{' '}
                {labels[draft.correction.source.condition_code] ??
                  draft.correction.source.condition_code}{' '}
                · {conditionStatus(draft.correction.source.status)} · Revisión{' '}
                {draft.correction.source.revision}
              </p>
              <p className="whitespace-pre-wrap break-words">
                Evidencia original:{' '}
                {draft.correction.source.surfaces.join(', ') || 'Sin superficies'} ·{' '}
                {draft.correction.source.note || 'Sin nota'}
              </p>
              {conflictPending && conflict && (
                <p className="whitespace-pre-wrap break-words">
                  Fuente actual: Pieza {conflict.tooth_fdi} · {conditionStatus(conflict.status)} ·
                  Revisión {conflict.revision} · {conflict.surfaces.join(', ')} · {conflict.note}
                </p>
              )}
              <p>
                Se marcará como registrado por error. No implica resolución clínica ni borra
                revisiones anteriores.
              </p>
              <p className="whitespace-pre-wrap break-words">
                Motivo: {draft.correction.reason.trim()}
              </p>
              <p className="whitespace-pre-wrap break-words">
                {draft.correction.replacement
                  ? `Reemplazo nuevo: Pieza ${draft.tooth_fdi} · ${labels[draft.condition_code]} · ${draft.dentition === 'permanent' ? 'Permanente' : 'Temporal'} · ${draft.surfaces.join(', ') || 'Sin superficies especificadas'} · ${draft.note?.trim() || 'Sin nota'}`
                  : 'Sin registro de reemplazo.'}
              </p>
              <AlertDialogFooter>
                <AlertDialogCancel>Volver al borrador</AlertDialogCancel>
                <Button variant="clinical" onClick={() => void save(true)}>
                  Guardar corrección
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {pending && (
          <AlertDialog
            open
            onOpenChange={(open) => {
              if (saving || dental.busy || notes.busy) return;
              if (!open) {
                routeCancel.current?.();
                routeCancel.current = null;
                setPending(null);
                guard?.cancelTransition();
              }
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {pendingNotes && notes.dirty ? 'Nota sin guardar' : 'Condición sin guardar'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {attempt?.correction
                    ? 'La corrección pudo guardarse. Descartar no la deshace; el reintento conserva el mismo contenido.'
                    : dental.attempt
                      ? 'La operación pudo guardarse. Reintenta con el mismo contenido o descarta el intento sin borrar su historial.'
                      : 'Guarda, descarta los cambios o sigue editando.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {(saveError || notes.error) && (
                <p role="alert" className="text-error">
                  {saveError || notes.error}
                </p>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel
                  disabled={saving || dental.busy || notes.busy}
                  onClick={() => {
                    routeCancel.current?.();
                    routeCancel.current = null;
                    setPending(null);
                    guard?.cancelTransition();
                  }}
                >
                  Seguir editando
                </AlertDialogCancel>
                <Button
                  variant="clinicalSecondary"
                  disabled={saving || dental.busy || notes.busy}
                  onClick={discard}
                >
                  {pendingNotes && notes.dirty ? 'Descartar nota y cambios' : 'Descartar condición'}
                </Button>
                <Button
                  variant="clinical"
                  aria-busy={saving || notes.busy}
                  className="inline-flex w-[220px] max-w-full items-center justify-center gap-2"
                  disabled={
                    saving ||
                    notes.busy ||
                    (pendingNotes && !!notes.latest) ||
                    dental.busy ||
                    !!draft?.correction ||
                    conflictBlocked ||
                    (!!treatmentEdit && !treatmentSaveAvailable) ||
                    (!(pendingNotes && notes.dirty) &&
                      !treatmentEdit &&
                      !dental.attempt &&
                      (!draft?.tooth_fdi || !draft?.condition_code))
                  }
                  onClick={async () => {
                    if (pendingNotes && notes.dirty) {
                      await notes.save();
                      return;
                    }
                    if (treatmentEdit) {
                      await treatmentSaveRef.current?.();
                      return;
                    }
                    if (!dental.attempt) {
                      void save();
                      return;
                    }
                    if (await dental.retry()) {
                      const continuation = pending;
                      setPending(null);
                      guard?.cancelTransition();
                      if (continuation) window.requestAnimationFrame(continuation);
                    }
                  }}
                >
                  {(saving || notes.busy) && <Spinner />}
                  {saving || notes.busy ? 'Guardando…' : 'Guardar y continuar'}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </section>
      {notesWidth >= 1160 ? (
        <div className={notesWidth >= 1280 ? 'w-96 shrink-0' : 'w-80 shrink-0'}>
          <DentalClinicalNotes
            notes={notes}
            hideSaveIndicator={!!pending}
            onHighlight={setNoteHighlightedTeeth}
          />
        </div>
      ) : (
        <>
          <Button
            variant="clinical"
            className="fixed bottom-[calc(16px+env(safe-area-inset-bottom))] right-4 z-30 min-h-[44px]"
            ref={notesTriggerRef}
            onClick={() => setNotesSheet(true)}
          >
            Notas
          </Button>
          <Sheet open={notesSheet} onOpenChange={setNotesSheet}>
            <SheetContent
              aria-describedby={undefined}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                notesTriggerRef.current?.focus();
              }}
              className="[&_button]:min-h-11 [&_button]:min-w-11"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Notas clínicas</SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto">
                <DentalClinicalNotes
                  notes={notes}
                  hideSaveIndicator={!!pending}
                  onHighlight={setNoteHighlightedTeeth}
                />
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}

function conditionStatus(status: PatientCondition['status']): string {
  return status === 'active'
    ? 'Activa'
    : status === 'resolved'
      ? 'Resuelta'
      : 'Registrada por error';
}

function recordGroup(record: PatientCondition | PatientTreatment): string {
  if ('condition_code' in record) return `Pieza ${record.tooth_fdi}`;
  return record.teeth.length
    ? `Pieza ${record.teeth[0].tooth_fdi}`
    : `Arcada ${record.arch === 'upper' ? 'superior' : 'inferior'}`;
}

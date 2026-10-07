import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { UNSAFE_DataRouterContext } from 'react-router-dom';
import { useAutosizeTextarea } from '../../hooks/useAutosizeTextarea';
import { useOptionalTransitionGuard } from '../../hooks/useTransitionGuard';
import {
  ApiError,
  type ConditionCatalog,
  type ConditionCorrectionReceipt,
  type CorrectPatientCondition,
  type CreatePatientCondition,
  type Dentition,
  type Patient,
  type PatientCondition,
  type ToothSurface,
  type UpdatePatientCondition,
  correctPatientCondition,
  createPatientCondition,
  getConditionCatalog,
  getPatientCondition,
  getPatientConditions,
  updatePatientCondition,
} from '../../lib/api';
import { formatClinicalDateShort, formatClinicalTime } from '../../lib/clinicalDate';
import {
  conditionGroups,
  normalizeConditionCatalog,
  resolveCondition,
  surfaceDescription,
} from '../../lib/odontogramPresentation';
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
import { ConditionSymbol } from './ConditionSymbol';
import { PatientActorLabel } from './PatientActorLabel';
import { PatientConditionHistory } from './PatientConditionHistory';
import { PatientNoteNavigationGuard } from './PatientNoteNavigationGuard';
import { PatientOdontogram } from './PatientOdontogram';
import { ToothDrawing } from './ToothDrawing';
import { fdiTeeth } from './toothGeometry';

interface ConditionDraft extends CreatePatientCondition {
  correction?: { source: PatientCondition; reason: string; replacement: boolean };
  expectedRevision?: number;
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
}
interface ConditionAttempt {
  id: string;
  create?: CreatePatientCondition;
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
}: PatientDiagnosisProps): JSX.Element {
  return (
    <PatientDiagnosisWorkspace
      key={patientId}
      patientId={patientId}
      focusedConditionId={focusedConditionId}
      patient={patient}
      onConditionFocus={onConditionFocus}
    />
  );
}

function PatientDiagnosisWorkspace({
  patientId,
  focusedConditionId,
  patient,
  onConditionFocus,
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
  const [highlightedTooth, setHighlightedTooth] = useState(0);
  const [status, setStatus] = useState<'all' | 'active' | 'resolved' | 'entered_in_error'>(
    'active',
  );
  const [focused, setFocused] = useState<PatientCondition | null>(null);
  const [focusError, setFocusError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ConditionDraft | null>(null);
  const [attempt, setAttempt] = useState<ConditionAttempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<PatientCondition | null>(null);
  const [conflictPending, setConflictPending] = useState(false);
  const [conflictChoices, setConflictChoices] = useState<ConflictChoices>({});
  const [resolveConfirmed, setResolveConfirmed] = useState(false);
  const [duplicate, setDuplicate] = useState<PatientCondition | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
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
  const toothSelectRef = useRef<HTMLSelectElement>(null);
  const pieceButtonRef = useRef<HTMLButtonElement>(null);
  const firstSurfaceRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const recordRefs = useRef(new Map<string, HTMLElement>());
  useAutosizeTextarea({
    ref: noteRef,
    value: draft?.note ?? '',
    maxHeight: Math.floor(window.innerHeight / 3),
  });
  const dirty =
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
  const groups = conditionGroups(catalog);
  const activeGroup = groups.find((group) => group.key === category) ?? groups[0];
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
      setStatus(current.status);
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
    else if (draft && !draft.tooth_fdi) pieceButtonRef.current?.focus();
  }, [draft?.id]);
  const onRouteBlocked = useCallback((proceed: () => void, cancel: () => void): void => {
    routeCancel.current = cancel;
    setPending(() => proceed);
  }, []);
  useEffect(() => {
    if (!dirty && !saving) return;
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    const remove = guard?.registerBlocker((continuation) => {
      setPending(() => continuation);
      return true;
    });
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      remove?.();
    };
  }, [dirty, saving, guard]);
  const transition = (continuation: () => void): void => {
    if (guard) guard.guardTransition(continuation);
    else if (dirty || saving) setPending(() => continuation);
    else continuation();
  };
  const reset = (): void => {
    setHighlightedTooth(0);
    setDraft(null);
    setAttempt(null);
    setSaveError(null);
    setConflict(null);
    setConflictPending(false);
    setConflictChoices({});
    setResolveConfirmed(false);
    setDuplicate(null);
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
    const trigger = document.activeElement as HTMLElement;
    transition(() => {
      initiatingRef.current = trigger;
      setAttempt(null);
      setConflict(null);
      setDuplicate(null);
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
      setStatus(current.status);
      setHighlightedTooth(current.tooth_fdi);
      publishFocus(current.id);
    } catch {
      if (alive.current && request === focusSequence.current) setResultReadError(true);
    }
  };
  const chooseTool = (code: string): void => {
    if (locked || immutable || (draft?.correction && !draft.correction.replacement)) return;
    const tool = resolveCondition(catalog, code);
    if (!tool.supported || !tool.allowed_dentitions.includes(draft?.dentition ?? dentition)) return;
    if (!draft) {
      initiatingRef.current = document.activeElement as HTMLElement;
      const next = {
        id: crypto.randomUUID(),
        dentition,
        tooth_fdi: 0,
        condition_code: code,
        surfaces: [],
        note: '',
        status: 'active' as const,
      };
      setDraft({ ...next, baseline: '' });
      return;
    }
    const compatible = !!tool?.surface_codes.length;
    if (!compatible && draft.surfaces.length)
      setAnnouncement('Superficies retiradas: esta condición no admite superficies.');
    setDraft({ ...draft, condition_code: code, surfaces: compatible ? draft.surfaces : [] });
  };
  const chooseTooth = (tooth: number): void => {
    if (locked || immutable || (draft?.correction && !draft.correction.replacement)) return;
    const tool = draft ? resolveCondition(catalog, draft.condition_code) : null;
    if (draft) setDraft({ ...draft, tooth_fdi: tooth });
    else {
      initiatingRef.current = document.activeElement as HTMLElement;
      setDraft({
        id: crypto.randomUUID(),
        dentition,
        tooth_fdi: tooth,
        condition_code: '',
        surfaces: [],
        note: '',
        status: 'active',
        baseline: '',
      });
    }
    window.requestAnimationFrame(() => {
      if (tool?.supported && tool.surface_codes.length) firstSurfaceRef.current?.focus();
      else noteRef.current?.focus();
    });
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
        correction: {
          operation_id: crypto.randomUUID(),
          expected_revision: source.revision,
          reason: draft.correction.reason.trim(),
          replacement: draft.correction.replacement
            ? {
                id: draft.id,
                dentition: draft.dentition,
                tooth_fdi: draft.tooth_fdi,
                condition_code: draft.condition_code,
                surfaces: surfaces
                  .filter((item) => draft.surfaces.includes(item.code))
                  .map((item) => item.code),
                note: draft.note?.trim() || null,
              }
            : null,
        },
      };
      if (!frozen.correction) return false;
      setAttempt(frozen);
      setReview(false);
      setSaving(true);
      savingRef.current = true;
      setSaveError(null);
      try {
        const result = await correctPatientCondition(patientId, frozen.id, frozen.correction);
        if (!alive.current) return false;
        setReceipt(result);
        setAnnouncement('Corrección confirmada en ficha.');
        reset();
        setPending(null);
        routeCancel.current?.();
        routeCancel.current = null;
        guard?.cancelTransition();
        void load();
        void activateResult(
          result.replacement_condition_id ?? result.condition_id,
          result.replacement_revision_id ?? result.correction_revision_id,
        );
        return true;
      } catch (error) {
        if (!alive.current) return false;
        if (error instanceof ApiError && [404, 409, 422].includes(error.status)) {
          setAttempt(null);
          const detail = (error.body as { detail?: { code?: string } })?.detail;
          if (
            error.status === 409 &&
            ['revision_conflict', 'condition_entered_in_error'].includes(detail?.code ?? '')
          ) {
            setConflictPending(true);
            setConflict(null);
            setSaveError(
              'La condición cambió. Revisa el original actual antes de confirmar una nueva corrección.',
            );
            try {
              const current = await getPatientCondition(patientId, frozen.id);
              if (alive.current) setConflict(current);
            } catch {
              if (alive.current)
                setSaveError(
                  'No pudimos cargar la versión actual. Reintenta sin perder tus cambios.',
                );
            }
          } else if (error.status === 409 && detail?.code === 'idempotency_conflict') {
            setRecoveryBlocked(true);
            setConflictPending(true);
            setConflict(null);
            setSaveError(
              'Este intento tiene otro contenido guardado. Descarta el borrador y consulta el historial.',
            );
          } else
            setSaveError(
              error.status === 404
                ? 'La condición no está disponible. Conservamos tu borrador.'
                : error.status === 422
                  ? 'Revisa el motivo y los datos del reemplazo (máximo 1000 caracteres).'
                  : 'Ya existe esta condición activa. Conservamos el motivo y el reemplazo; revisa sus datos.',
            );
        } else
          setSaveError(
            'No confirmamos la corrección. Reintenta con el mismo contenido. Descartar no deshace una corrección que pudo guardarse.',
          );
        return false;
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
      ...(draft.expectedRevision === undefined
        ? { create: normalized }
        : {
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
          }),
    };
    setAttempt(frozen);
    setSaveError(null);
    setSaving(true);
    savingRef.current = true;
    try {
      const saved = frozen.create
        ? await createPatientCondition(patientId, frozen.create)
        : await updatePatientCondition(
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
        const detail = (error.body as { detail?: { code?: string; existing?: PatientCondition } })
          ?.detail;
        if (error.status === 409 && detail?.code === 'active_condition_exists') {
          setDuplicate(detail.existing ?? null);
          setSaveError(
            'Ya existe esta condición activa. Abre el registro existente o cambia las superficies.',
          );
        } else if (error.status === 409 && detail?.code === 'idempotency_conflict') {
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
    const continuation = pending;
    reset();
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
    <section
      aria-label="Diagnóstico manual"
      className="space-y-5 [container-type:inline-size] [&_button]:min-h-[44px]"
    >
      {dataRouter && (
        <PatientNoteNavigationGuard dirty={dirty || saving} onBlocked={onRouteBlocked} />
      )}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Diagnóstico manual</h2>
          <p className="text-sm text-muted">
            Selecciona y revisa. Solo Guardar registra una condición.
          </p>
        </div>
        <div className="flex gap-2" aria-label="Dentición">
          {(['permanent', 'primary'] as const).map((mode) => (
            <Button
              key={mode}
              variant="clinicalSecondary"
              aria-pressed={dentition === mode}
              className="aria-pressed:border-primary aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:text-foreground"
              disabled={saving || draft?.expectedRevision !== undefined}
              onClick={() => {
                if (mode === dentition) return;
                transition(() => {
                  reset();
                  setDentition(mode);
                });
              }}
            >
              {mode === 'permanent' ? 'Permanente' : 'Temporal'}
            </Button>
          ))}
        </div>
      </header>
      <p role="status" className="sr-only">
        {announcement}
      </p>
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
              Corrección guardada; no pudimos actualizar el resultado. Reintenta su lectura con los
              enlaces, sin volver a guardar.
            </p>
          )}
          {readError && (
            <p>
              Corrección guardada; la lista está desactualizada. Reintentar condiciones solo repite
              la lectura.
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
      {/* ponytail: reserve 744px for the chart, 20px gap and 300px inspector. */}
      <div className="grid items-start gap-5 [@container(min-width:1064px)]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <PatientOdontogram
            complete={!loading && !readError}
            dentition={dentition}
            conditions={visible}
            labels={labels}
            catalog={catalog}
            selectedTooth={draft?.tooth_fdi ?? focused?.tooth_fdi ?? 0}
            highlightedTooth={highlightedTooth}
            onSelect={chooseTooth}
            onHighlight={setHighlightedTooth}
            disabled={locked || immutable || !!(draft?.correction && !draft.correction.replacement)}
          />
          <label className="block text-sm" htmlFor="chart-tooth">
            Seleccionar pieza FDI
          </label>
          <select
            id="chart-tooth"
            ref={toothSelectRef}
            className="min-h-[44px] w-full rounded border border-border bg-surface p-2"
            value={draft?.tooth_fdi || ''}
            disabled={locked || immutable || !!(draft?.correction && !draft.correction.replacement)}
            onChange={(event) => chooseTooth(Number(event.target.value))}
          >
            <option value="">Selecciona una pieza</option>
            {fdiTeeth(dentition).map((tooth) => (
              <option key={tooth} value={tooth}>
                Pieza {tooth}
              </option>
            ))}
          </select>
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
            <div className="flex flex-wrap gap-2">
              {activeGroup?.entries.map((tool) => (
                <Button
                  key={tool.code}
                  variant="clinicalSecondary"
                  aria-pressed={draft?.condition_code === tool.code}
                  className="aria-pressed:border-primary aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:text-foreground"
                  disabled={
                    locked ||
                    immutable ||
                    !tool.allowed_dentitions.includes(draft?.dentition ?? dentition) ||
                    !!(draft?.correction && !draft.correction.replacement)
                  }
                  onClick={() => chooseTool(tool.code)}
                >
                  <ConditionSymbol code={tool.symbol} />
                  {tool.label_es}
                  {tool.symbolUnavailable && <span className="sr-only">Símbolo no disponible</span>}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <aside
          aria-label="Editor de condición"
          className="min-w-0 [@container(min-width:1064px)]:col-start-2 [@container(min-width:1064px)]:row-start-1 [@container(min-width:1064px)]:row-span-2"
        >
          {draft && (
            <form
              className="space-y-3 rounded border border-border bg-surface p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  transition(reset);
                }
              }}
            >
              <h3 className="font-semibold">
                {draft.correction
                  ? 'Corregir registro'
                  : draft.status === 'resolved'
                    ? 'Resolver condición'
                    : draft.expectedRevision
                      ? 'Editar condición'
                      : 'Nueva condición'}
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
                      Al guardar se marcará como resuelta. El registro y su historial se conservan.
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
                  <Button
                    type="button"
                    ref={pieceButtonRef}
                    variant="clinicalSecondary"
                    disabled={
                      locked || immutable || !!(draft.correction && !draft.correction.replacement)
                    }
                    onClick={() => toothSelectRef.current?.focus()}
                  >
                    {draft.tooth_fdi > 0 ? 'Cambiar pieza' : 'Elegir pieza'}
                  </Button>
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
                                ref={item.code === 'M' ? firstSurfaceRef : undefined}
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
              {duplicate && (
                <Button
                  type="button"
                  variant="clinicalSecondary"
                  onClick={() =>
                    transition(() => {
                      reset();
                      setFocused(duplicate);
                      setDentition(duplicate.dentition);
                      publishFocus(duplicate.id);
                    })
                  }
                >
                  Abrir condición existente
                </Button>
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
                  {conflict && draft.base && !draft.correction && conflict.status === 'active' && (
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
                                  setConflictChoices({ ...conflictChoices, surfaces: 'current' })
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
                      El original ya está registrado por error. Consulta su historial o descarta el
                      borrador; no puede corregirse de nuevo.
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
          )}
          {!draft && (
            <div className="rounded border border-border bg-surface p-4">
              <h3 className="font-semibold">Registrar condición</h3>
              <p className="mt-2 text-sm text-muted">
                Elige una condición y una pieza. Revisa las superficies y confirma Guardar.
              </p>
            </div>
          )}
        </aside>
        <div className="min-w-0 space-y-4 [@container(min-width:1064px)]:col-start-1">
          {' '}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Condiciones por pieza</h3>
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
                <option value="all">Todas</option>
                <option value="active">Actuales</option>
                <option value="resolved">Resueltas</option>
                <option value="entered_in_error">Registradas por error</option>
              </select>
            </label>
          </div>
          {!loading && !readError && visible.length === 0 && (
            <p className="text-muted">
              {status === 'active'
                ? 'Sin registros actuales'
                : 'Sin condiciones en esta dentición y estado.'}
            </p>
          )}
          {visible.length > 0 && (
            <p className="text-sm text-muted">
              {loading || readError ? 'Lectura incompleta · ' : ''}
              {visible.length} {loading || readError ? 'registros cargados' : 'condiciones'} en{' '}
              {new Set(visible.map((record) => record.tooth_fdi)).size} piezas
              {loading || readError ? '; no es un total completo' : ''}
            </p>
          )}
          <details className="text-sm">
            <summary className="min-h-[44px] cursor-pointer">Leyenda de conceptos</summary>
            <ul>
              {groups
                .flatMap((group) => group.entries)
                .map((entry) => (
                  <li key={entry.code} className="flex items-center gap-2">
                    <ConditionSymbol code={entry.symbol} />
                    {entry.label}
                    {entry.symbolUnavailable && ' · Símbolo no disponible'}
                  </li>
                ))}
            </ul>
          </details>
          <ol className="divide-y divide-border">
            {visible.map((record) => (
              <li key={record.id}>
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
                  className={`space-y-3 rounded py-4 focus-visible:ring-2 focus-visible:ring-primary ${highlightedTooth === record.tooth_fdi ? 'bg-surface' : ''}`}
                >
                  <h4 className="flex items-center gap-2 font-medium">
                    <ConditionSymbol
                      code={resolveCondition(catalog, record.condition_code).symbol}
                      resolved={record.status === 'resolved'}
                      error={record.status === 'entered_in_error'}
                    />
                    Pieza {record.tooth_fdi} ·{' '}
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
                  <p className="text-xs text-muted">
                    {formatClinicalDateShort(record.updated_at)}{' '}
                    {formatClinicalTime(record.updated_at)} · Revisión {record.revision}
                  </p>
                  <PatientActorLabel
                    actor={record.updated_by}
                    actors={visible.map((item) => item.updated_by)}
                  />
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
                          transition(() => void activateResult(record.supersedes_condition_id))
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
                            saving || !resolveCondition(catalog, record.condition_code).supported
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
              </li>
            ))}
          </ol>
        </div>
      </div>
      {review && draft?.correction && (
        <AlertDialog open onOpenChange={setReview}>
          <AlertDialogContent className="max-h-[calc(100dvh-32px)] overflow-y-auto break-words [&>*]:shrink-0 [&_button]:min-h-[44px]">
            <AlertDialogHeader>
              <AlertDialogTitle>Revisar corrección</AlertDialogTitle>
              <AlertDialogDescription>
                Paciente de la ficha abierta. Confirma el registro original y la consecuencia antes
                de guardar.
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
              Evidencia original: {draft.correction.source.surfaces.join(', ') || 'Sin superficies'}{' '}
              · {draft.correction.source.note || 'Sin nota'}
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
              <AlertDialogTitle>Condición sin guardar</AlertDialogTitle>
              <AlertDialogDescription>
                {attempt?.correction
                  ? 'La corrección pudo guardarse. Descartar no la deshace; el reintento conserva el mismo contenido.'
                  : 'Guarda, descarta los cambios o sigue editando.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {saveError && (
              <p role="alert" className="text-error">
                {saveError}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={saving}
                onClick={() => {
                  routeCancel.current?.();
                  routeCancel.current = null;
                  setPending(null);
                  guard?.cancelTransition();
                }}
              >
                Seguir editando
              </AlertDialogCancel>
              <Button variant="clinicalSecondary" disabled={saving} onClick={discard}>
                Descartar condición
              </Button>
              <Button
                variant="clinical"
                aria-busy={saving}
                className="inline-flex w-[220px] max-w-full items-center justify-center gap-2"
                disabled={
                  saving ||
                  !!draft?.correction ||
                  conflictBlocked ||
                  !draft?.tooth_fdi ||
                  !draft?.condition_code
                }
                onClick={() => void save()}
              >
                {saving && <Spinner />}
                {saving ? 'Guardando…' : 'Guardar y continuar'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}

function conditionStatus(status: PatientCondition['status']): string {
  return status === 'active'
    ? 'Activa'
    : status === 'resolved'
      ? 'Resuelta'
      : 'Registrada por error';
}

import { useEffect, useRef, useState } from 'react';
import {
  ApiError,
  type CorrectPatientCondition,
  type CreatePatientCondition,
  type PatientCondition,
  correctPatientCondition,
  createPatientCondition,
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
type DentalAttempt = ApplicationAttempt | UndoAttempt;
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
  const perform = async (command: DentalAttempt): Promise<boolean> => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setAttempt(command);
    setError(null);
    try {
      let record: PatientCondition | undefined;
      if (command.kind === 'apply') record = await createPatientCondition(patientId, command.body);
      else await correctPatientCondition(patientId, command.id, command.body);
      if (!alive.current || mountedPatient.current !== patientId) return false;
      setAttempt(null);
      setActiveTool(null);
      setApplied(record ?? null);
      onCommitted(record);
      return true;
    } catch (caught) {
      if (!alive.current || mountedPatient.current !== patientId) return false;
      if (caught instanceof ApiError && [404, 409, 422].includes(caught.status)) {
        setAttempt(null);
        setError(
          caught.status === 409
            ? 'El registro cambió o ya existe. Consulta el registro y su historial antes de volver a aplicar.'
            : caught.status === 404
              ? 'El registro no está disponible. Actualiza las condiciones.'
              : 'Revisa la pieza y las superficies antes de volver a aplicar.',
        );
        onCommitted();
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
        setActiveTool(null);
        onCommitted();
      }
    },
  };
}

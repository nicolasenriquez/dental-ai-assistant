import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useClinicalComposerMemory,
  useOptionalClinicalRuntime,
} from '../components/ClinicalRuntimeProvider';
import { ApiError, type ClinicalContextConflict, openClinicalContext } from '../lib/api';
import type { WorkspaceContext } from '../lib/workspaceContext';

export function useContextualAssistant(context: WorkspaceContext) {
  const navigate = useNavigate();
  const shared = useOptionalClinicalRuntime();
  const memory = useClinicalComposerMemory();
  const [panelThreadId, setPanelThreadId] = useState<string | null>(null);
  const [width, setWidth] = useState(window.innerWidth);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ClinicalContextConflict | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const prefill = useRef<string | undefined>();
  const openingRef = useRef(false);
  const sequence = useRef(0);
  useLayoutEffect(() => {
    setPanelThreadId(null);
    setOpening(false);
    setError(null);
    setConflict(null);
    openingRef.current = false;
    prefill.current = undefined;
    trigger.current = null;
    return () => {
      sequence.current += 1;
    };
  }, [context.patientId, context.evolutionId]);
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      sequence.current += 1;
    };
  }, []);
  const close = useCallback(() => {
    setPanelThreadId(null);
    shared?.controller.detach();
    requestAnimationFrame(() => trigger.current?.focus());
  }, [shared?.controller.detach]);

  const open = async (text?: string, createNew = false): Promise<void> => {
    if (openingRef.current || !context.patientId) return;
    openingRef.current = true;
    const requestId = ++sequence.current;
    if (!createNew) {
      trigger.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      prefill.current = text;
    }
    setOpening(true);
    setError(null);
    try {
      const result = await openClinicalContext({
        patient_id: context.patientId,
        evolution_id: context.evolutionId,
        thread_id: createNew ? undefined : (shared?.activeThreadId ?? undefined),
        mode: createNew ? 'create_new' : 'reuse_compatible',
      });
      if (requestId !== sequence.current) return;
      setConflict(null);
      if (prefill.current)
        memory?.setDrafts((current) => ({
          ...current,
          [result.thread.id]: current[result.thread.id] || prefill.current || '',
        }));
      if (!shared || width < 768) navigate(`/a/${result.thread.id}`);
      else {
        shared.activate(result.thread.id);
        setPanelThreadId(result.thread.id);
      }
    } catch (caught) {
      if (requestId !== sequence.current) return;
      const detail =
        caught instanceof ApiError &&
        caught.body &&
        typeof caught.body === 'object' &&
        'detail' in caught.body
          ? caught.body.detail
          : null;
      if (
        caught instanceof ApiError &&
        caught.status === 409 &&
        detail &&
        typeof detail === 'object' &&
        'code' in detail &&
        detail.code === 'CLINICAL_CONTEXT_CONFLICT'
      )
        setConflict(detail as ClinicalContextConflict);
      else setError('No pudimos abrir el asistente para este paciente. Intenta nuevamente.');
    } finally {
      if (requestId === sequence.current) {
        openingRef.current = false;
        setOpening(false);
      }
    }
  };
  useEffect(() => {
    if (width < 768 && panelThreadId) {
      setPanelThreadId(null);
      navigate(`/a/${panelThreadId}`);
    }
  }, [navigate, panelThreadId, width]);
  return {
    panelThreadId,
    width,
    opening,
    error,
    conflict,
    open,
    close,
    continueCurrent: () => {
      if (conflict) navigate(`/a/${conflict.current.thread_id}`);
      setConflict(null);
    },
    createNew: () => open(undefined, true),
  };
}

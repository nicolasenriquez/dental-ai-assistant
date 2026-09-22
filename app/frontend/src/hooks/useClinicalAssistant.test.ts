import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ClinicalDraft,
  type ClinicalPatient,
  type ClinicalThread,
  getClinicalThread,
  prepareClinicalSave,
  regenerateClinicalDraft,
  resolveClinicalPatientSwitch,
  setClinicalActivePatient,
  streamClinicalTurn,
  updateClinicalArtifact,
} from '../lib/api';
import type { ClinicalDraftItem } from './clinicalRuntime';
import { useClinicalAssistant } from './useClinicalAssistant';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    getClinicalThread: vi.fn(),
    prepareClinicalSave: vi.fn(),
    regenerateClinicalDraft: vi.fn(),
    streamClinicalTurn: vi.fn(),
    resolveClinicalPatientSwitch: vi.fn(),
    setClinicalActivePatient: vi.fn(),
    updateClinicalArtifact: vi.fn(),
  };
});

afterEach(() => vi.useRealTimers());

const patientA: ClinicalPatient = {
  id: 'patient-a',
  first_name: 'Ana',
  last_name: 'Pérez',
  rut_masked: '12.345.•••-6',
  birth_date: '1990-01-01',
};

const patientB: ClinicalPatient = {
  id: 'patient-b',
  first_name: 'Bruno',
  last_name: 'Rojas',
  rut_masked: '98.765.•••-4',
  birth_date: '1988-02-02',
};

function thread(activePatient: ClinicalPatient | null): ClinicalThread {
  return {
    id: 'thread-1',
    owner_user_id: 'user-1',
    title: 'Asistente',
    active_patient: activePatient,
    pending_action_patient: null,
    active_turn_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    messages: [],
    artifacts: [],
    pending_action: null,
    actions: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const draft: ClinicalDraft = {
  context: 'context',
  findings: 'findings',
  assessment: 'assessment',
  treatment: 'treatment',
  follow_up: 'follow-up',
  review_flags: [],
};

const artifact = {
  id: 'artifact-1',
  owner_user_id: 'user-1',
  thread_id: 'thread-1',
  turn_id: 'turn-1',
  patient_id: 'patient-a',
  artifact_type: 'clinical_draft' as const,
  status: 'draft' as const,
  source_note: 'note',
  generated_draft: draft,
  draft,
  evolution_at: '2026-09-17T12:00:00Z',
  created_at: '2026-09-17T12:00:00Z',
  updated_at: '2026-09-17T12:00:00Z',
};

describe('clinical redaction and artifact ordering', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getClinicalThread).mockResolvedValue({ ...thread(null), artifacts: [artifact] });
    vi.mocked(updateClinicalArtifact).mockResolvedValue(artifact);
    vi.mocked(regenerateClinicalDraft).mockResolvedValue(draft);
  });

  it.each(['12.345.6785', '12.345.678 5', '12 345 678 - 5', '123456785'])(
    'redacts %s optimistically and accepts server sanitization without hydration',
    async (rut) => {
      const response = deferred<Response>();
      vi.mocked(streamClinicalTurn).mockReturnValue(response.promise);
      const { result } = renderHook(() => useClinicalAssistant('thread-1'));
      await waitFor(() => expect(result.current.thread).not.toBeNull());
      vi.mocked(getClinicalThread).mockRejectedValue(new Error('offline'));
      let sending!: Promise<boolean>;
      act(() => {
        sending = result.current.send(`Nota ${rut}`, [
          {
            id: 'context-1',
            kind: 'drive_selection',
            sourceId: 'file-1',
            sourceName: rut,
            content: `Contexto ${rut}`,
          },
        ]);
      });
      expect(JSON.stringify(result.current.items)).not.toContain(rut);
      const turnId = vi.mocked(streamClinicalTurn).mock.calls[0][1].turn_id;
      await act(async () => {
        response.resolve(
          new Response(
            `event: turn.started\ndata: ${JSON.stringify({
              schema_version: 1,
              event_id: 'event-1',
              sequence: 1,
              thread_id: 'thread-1',
              turn_id: turnId,
              item_id: `user:${turnId}`,
              item_type: 'user_message',
              status: 'completed',
              data: { user_content: 'Nota [RUT no encontrado]' },
            })}\n\n`,
          ),
        );
        await sending;
      });
      expect(result.current.items.find((item) => item.type === 'user')).toMatchObject({
        content: 'Nota [RUT no encontrado]',
        contextItems: [{ sourceId: 'file-1', sourceName: '••••', content: 'Contexto ••••' }],
      });
    },
  );

  it.each([false, true])(
    'preserves a corrected source with an in-flight autosave: %s',
    async (inFlight) => {
      const { result } = renderHook(() => useClinicalAssistant('thread-1'));
      await waitFor(() => expect(result.current.items).toHaveLength(1));
      vi.useFakeTimers();
      const first = deferred<typeof artifact>();
      if (inFlight) vi.mocked(updateClinicalArtifact).mockReturnValueOnce(first.promise);
      act(() => result.current.updateDraft(artifact.id, { ...draft, context: 'edited' }));
      act(() => result.current.updateDraftDate(artifact.id, '2026-09-18T12:00:00Z'));
      if (inFlight) await act(async () => vi.advanceTimersByTimeAsync(300));
      let saving!: Promise<boolean>;
      act(() => {
        saving = result.current.updateDraftSource(artifact.id, 'corrected');
      });
      await act(async () => {
        first.resolve(artifact);
        expect(await saving).toBe(true);
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(updateClinicalArtifact).toHaveBeenCalledTimes(inFlight ? 2 : 1);
      expect(vi.mocked(updateClinicalArtifact).mock.lastCall?.[2]).toEqual({
        source_note: 'corrected',
        draft: { ...draft, context: 'edited' },
        evolution_at: '2026-09-18T12:00:00Z',
      });
    },
  );

  it('excludes regeneration during source persistence and edits during regeneration', async () => {
    const save = deferred<typeof artifact>();
    const generation = deferred<ClinicalDraft>();
    vi.mocked(updateClinicalArtifact).mockReturnValueOnce(save.promise);
    vi.mocked(regenerateClinicalDraft).mockReturnValueOnce(generation.promise);
    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    let saving!: Promise<boolean>;
    act(() => {
      saving = result.current.updateDraftSource(artifact.id, 'corrected');
    });
    await act(async () => {
      await result.current.regenerateDraft(result.current.items[0] as ClinicalDraftItem);
    });
    expect(regenerateClinicalDraft).not.toHaveBeenCalled();
    expect(result.current.items[0].status).toBe('running');
    await act(async () => {
      save.resolve(artifact);
      await saving;
    });
    let generating!: Promise<void>;
    act(() => {
      generating = result.current.regenerateDraft(result.current.items[0] as ClinicalDraftItem);
    });
    await waitFor(() => expect(regenerateClinicalDraft).toHaveBeenCalledTimes(1));
    await act(async () => {
      expect(await result.current.updateDraftSource(artifact.id, 'conflict')).toBe(false);
      result.current.updateDraft(artifact.id, { ...draft, context: 'conflict' });
      result.current.updateDraftDate(artifact.id, '2027-01-01T12:00:00Z');
      await result.current.regenerateDraft(result.current.items[0] as ClinicalDraftItem);
      expect(
        await result.current.prepareDraft(result.current.items[0] as ClinicalDraftItem),
      ).toBeNull();
    });
    expect(prepareClinicalSave).not.toHaveBeenCalled();
    expect(regenerateClinicalDraft).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateClinicalArtifact).mock.lastCall?.[2].source_note).toBe('corrected');
    await act(async () => {
      generation.resolve({ ...draft, context: 'regenerated' });
      await generating;
    });
    expect(result.current.items[0]).toMatchObject({
      status: 'completed',
      sourceNote: 'corrected',
      stale: false,
      evolutionAt: artifact.evolution_at,
      draft: { context: 'regenerated' },
    });
  });

  it('waits for an in-flight autosave before persisting and regenerating', async () => {
    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    vi.useFakeTimers();
    const save = deferred<typeof artifact>();
    vi.mocked(updateClinicalArtifact).mockReturnValueOnce(save.promise);
    act(() => result.current.updateDraftDate(artifact.id, '2026-09-18T12:00:00Z'));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    let generating!: Promise<void>;
    act(() => {
      generating = result.current.regenerateDraft(result.current.items[0] as ClinicalDraftItem);
    });
    expect(regenerateClinicalDraft).not.toHaveBeenCalled();
    expect(updateClinicalArtifact).toHaveBeenCalledTimes(1);
    await act(async () => {
      save.resolve(artifact);
      await generating;
    });
    expect(updateClinicalArtifact).toHaveBeenCalledTimes(2);
    expect(regenerateClinicalDraft).toHaveBeenCalledTimes(1);
    expect(result.current.artifactSyncState[artifact.id]).toBe('saved');
  });

  it('keeps a failed source save stale and blocks regeneration until persistence is retried', async () => {
    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    vi.mocked(updateClinicalArtifact).mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      expect(await result.current.updateDraftSource(artifact.id, 'corrected')).toBe(false);
    });
    await act(async () => {
      await result.current.regenerateDraft(result.current.items[0] as ClinicalDraftItem);
    });
    expect(regenerateClinicalDraft).not.toHaveBeenCalled();
    expect(result.current.items[0]).toMatchObject({
      status: 'completed',
      sourceNote: 'corrected',
      stale: true,
    });
    expect(result.current.artifactSyncState[artifact.id]).toBe('error');
    await act(async () => {
      expect(await result.current.updateDraftSource(artifact.id, 'corrected')).toBe(true);
    });
    await act(async () => {
      await result.current.regenerateDraft(result.current.items[0] as ClinicalDraftItem);
    });
    expect(regenerateClinicalDraft).toHaveBeenCalledTimes(1);
  });

  it('flushes pending edits before regeneration and releases the lock on failure', async () => {
    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    vi.useFakeTimers();
    act(() => result.current.updateDraftDate(artifact.id, '2026-09-18T12:00:00Z'));
    vi.mocked(updateClinicalArtifact).mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await result.current.regenerateDraft(result.current.items[0] as ClinicalDraftItem);
    });
    expect(regenerateClinicalDraft).not.toHaveBeenCalled();
    expect(result.current.items[0].status).toBe('completed');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(updateClinicalArtifact).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateClinicalArtifact).mock.lastCall?.[2].evolution_at).toBe(
      '2026-09-18T12:00:00Z',
    );
    vi.mocked(regenerateClinicalDraft).mockRejectedValueOnce(new Error('model unavailable'));
    await act(async () => {
      await result.current.regenerateDraft(result.current.items[0] as ClinicalDraftItem);
    });
    expect(result.current.items[0]).toMatchObject({ status: 'completed', draft });
    await act(async () => {
      expect(await result.current.updateDraftSource(artifact.id, 'retry')).toBe(true);
    });
  });
});

describe('useClinicalAssistant active patient persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClinicalThread).mockResolvedValue(thread(null));
  });

  it('ignores a stale active-patient response', async () => {
    const first = deferred<ClinicalThread>();
    const second = deferred<ClinicalThread>();
    vi.mocked(setClinicalActivePatient).mockImplementation((_threadId, patientId) =>
      patientId === patientA.id ? first.promise : second.promise,
    );

    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.thread).not.toBeNull());

    act(() => {
      void result.current.setActivePatient(patientA.id);
      void result.current.setActivePatient(patientB.id);
    });

    await act(async () => {
      second.resolve(thread(patientB));
      await second.promise;
    });
    expect(result.current.thread?.active_patient?.id).toBe(patientB.id);

    await act(async () => {
      first.resolve(thread(patientA));
      await first.promise;
    });
    expect(result.current.thread?.active_patient?.id).toBe(patientB.id);
  });

  it('does not let an old thread loader mutate the active thread', async () => {
    vi.mocked(getClinicalThread).mockImplementation(async (threadId) => ({
      ...thread(null),
      id: threadId,
    }));
    const { result, rerender } = renderHook(({ threadId }) => useClinicalAssistant(threadId), {
      initialProps: { threadId: 'thread-1' },
    });
    await waitFor(() => expect(result.current.thread?.id).toBe('thread-1'));
    const staleReload = result.current.reload;

    rerender({ threadId: 'thread-2' });
    await waitFor(() => expect(result.current.thread?.id).toBe('thread-2'));
    vi.mocked(getClinicalThread).mockClear();

    await act(async () => {
      await staleReload();
    });

    expect(getClinicalThread).not.toHaveBeenCalled();
    expect(result.current.thread?.id).toBe('thread-2');
  });

  it('hydrates structured Drive provenance on user messages', async () => {
    vi.mocked(getClinicalThread).mockResolvedValue({
      ...thread(null),
      messages: [
        {
          id: 'message-1',
          thread_id: 'thread-1',
          turn_id: 'turn-1',
          role: 'user',
          content: 'Actualizar evolución',
          created_at: '2026-01-01T00:00:00Z',
          context_items: [
            {
              id: 'context-1',
              kind: 'drive_selection',
              source_id: 'drive-file-1',
              source_name: 'Evaluación.md',
              content: 'Control en seis meses',
            },
          ],
        },
      ],
    });

    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    expect(result.current.items[0]).toMatchObject({
      type: 'user',
      content: 'Actualizar evolución',
      contextItems: [{ sourceName: 'Evaluación.md', content: 'Control en seis meses' }],
    });
  });

  it('hydrates a resolved patient switch without resending the turn', async () => {
    vi.mocked(getClinicalThread).mockResolvedValue({
      ...thread(patientB),
      messages: [
        {
          id: 'message-1',
          thread_id: 'thread-1',
          turn_id: 'turn-1',
          role: 'user',
          content: 'Actualizar a Bruno',
          created_at: '2026-01-01T00:00:00Z',
          patient_switch: {
            item_id: 'switch-1',
            current_patient: patientA,
            detected_patient: patientB,
            resolution: 'changed_patient',
          },
        },
      ],
    });

    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    expect(result.current.items[1]).toMatchObject({
      id: 'switch-1',
      type: 'patient_switch',
      status: 'completed',
      resolution: 'changed_patient',
    });
  });

  it('keeps a patient switch pending until keep-current persistence succeeds', async () => {
    const pendingThread: ClinicalThread = {
      ...thread(patientA),
      messages: [
        {
          id: 'message-1',
          thread_id: 'thread-1',
          turn_id: 'turn-1',
          role: 'user',
          content: 'Actualizar a Bruno',
          created_at: '2026-01-01T00:00:00Z',
          patient_switch: {
            item_id: 'switch-1',
            current_patient: patientA,
            detected_patient: patientB,
            resolution: 'pending',
          },
        },
      ],
    };
    const response = deferred<ClinicalThread>();
    vi.mocked(getClinicalThread).mockResolvedValue(pendingThread);
    vi.mocked(resolveClinicalPatientSwitch).mockReturnValue(response.promise);

    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    act(() => {
      void result.current.cancelPatientSwitch('switch-1');
    });
    expect(result.current.items[1]).toMatchObject({ resolution: 'pending', status: 'pending' });

    await act(async () => {
      response.resolve({
        ...pendingThread,
        messages: [
          {
            ...pendingThread.messages[0],
            patient_switch: {
              item_id: 'switch-1',
              current_patient: patientA,
              detected_patient: patientB,
              resolution: 'kept_current',
            },
          },
        ],
      });
      await response.promise;
    });

    expect(resolveClinicalPatientSwitch).toHaveBeenCalledWith('thread-1', 'turn-1', 'keep_current');
    expect(result.current.items[1]).toMatchObject({
      resolution: 'kept_current',
      status: 'completed',
    });
  });

  it('serializes autosaves for the same artifact', async () => {
    vi.useFakeTimers();
    const first = deferred<Awaited<ReturnType<typeof updateClinicalArtifact>>>();
    vi.mocked(updateClinicalArtifact)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof updateClinicalArtifact>>);
    vi.mocked(getClinicalThread).mockResolvedValue({
      ...thread(null),
      artifacts: [
        {
          id: 'artifact-1',
          owner_user_id: 'user-1',
          thread_id: 'thread-1',
          turn_id: 'turn-1',
          patient_id: 'patient-a',
          artifact_type: 'clinical_draft',
          status: 'draft',
          source_note: 'note',
          generated_draft: draft,
          draft,
          evolution_at: '2026-09-17T12:00:00Z',
          created_at: '2026-09-17T12:00:00Z',
          updated_at: '2026-09-17T12:00:00Z',
        },
      ],
    });
    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => result.current.updateDraft('artifact-1', { ...draft, context: 'first' }));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    act(() => result.current.updateDraft('artifact-1', { ...draft, context: 'second' }));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(updateClinicalArtifact).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve({} as Awaited<ReturnType<typeof updateClinicalArtifact>>);
      await first.promise;
      await vi.runAllTimersAsync();
    });

    expect(updateClinicalArtifact).toHaveBeenCalledTimes(2);
    expect(vi.mocked(updateClinicalArtifact).mock.calls[1][2].draft.context).toBe('second');
    vi.useRealTimers();
  });
});

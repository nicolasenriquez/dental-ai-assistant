import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  type ClinicalDraft,
  type ClinicalPatient,
  type ClinicalPendingAction,
  type ClinicalThread,
  cancelClinicalTurn,
  getClinicalThread,
  prepareClinicalSave,
  regenerateClinicalDraft,
  resolveClinicalAction,
  resolveClinicalPatientSwitch,
  retryClinicalDriveExport,
  setClinicalActivePatient,
  streamClinicalTurn,
  updateClinicalArtifact,
} from '../lib/api';
import type { ClinicalApprovalItem, ClinicalDraftItem } from './clinicalRuntime';
import { useClinicalAssistant } from './useClinicalAssistant';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    cancelClinicalTurn: vi.fn(),
    getClinicalThread: vi.fn(),
    prepareClinicalSave: vi.fn(),
    regenerateClinicalDraft: vi.fn(),
    resolveClinicalAction: vi.fn(),
    retryClinicalDriveExport: vi.fn(),
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
  it.each([false, true])(
    'keeps accepted delivery after detach (headers received: %s)',
    async (headersReceived) => {
      vi.mocked(getClinicalThread).mockResolvedValue(thread(patientA));
      let turnId = '';
      let failBody!: () => void;
      vi.mocked(streamClinicalTurn).mockImplementation((_id, request, signal) => {
        turnId = request.turn_id;
        if (headersReceived) {
          return Promise.resolve(
            new Response(
              new ReadableStream({
                start(controller) {
                  failBody = () => controller.error(new DOMException('Detached', 'AbortError'));
                },
              }),
            ),
          );
        }
        return new Promise((_resolve, reject) =>
          signal?.addEventListener('abort', () =>
            reject(new DOMException('Detached', 'AbortError')),
          ),
        );
      });
      const { result } = renderHook(() => useClinicalAssistant('thread-1'));
      await waitFor(() => expect(result.current.thread).not.toBeNull());
      let sending!: Promise<boolean>;
      act(() => {
        sending = result.current.send('Nota aceptada');
      });
      await waitFor(() => expect(streamClinicalTurn).toHaveBeenCalledOnce());
      vi.mocked(getClinicalThread).mockResolvedValue({
        ...thread(patientA),
        active_turn_id: turnId,
        messages: [
          {
            id: 'accepted',
            thread_id: 'thread-1',
            turn_id: turnId,
            role: 'user',
            content: 'Nota aceptada',
            created_at: '2026-10-05T12:00:00Z',
          },
        ],
      });
      await act(async () => {
        if (headersReceived) failBody();
        else result.current.detach();
        expect(await sending).toBe(true);
      });
      expect(streamClinicalTurn).toHaveBeenCalledOnce();
    },
  );

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getClinicalThread).mockResolvedValue({ ...thread(null), artifacts: [artifact] });
    vi.mocked(updateClinicalArtifact).mockResolvedValue(artifact);
    vi.mocked(regenerateClinicalDraft).mockResolvedValue(draft);
    vi.mocked(cancelClinicalTurn).mockResolvedValue({ status: 'cancelled' });
  });

  it('rehydrates a running turn and stops it through the explicit endpoint', async () => {
    vi.mocked(getClinicalThread).mockResolvedValue({
      ...thread(patientA),
      active_turn_id: 'turn-running',
      messages: [
        {
          id: 'user-running',
          thread_id: 'thread-1',
          turn_id: 'turn-running',
          role: 'user',
          content: 'Nota pendiente',
          turn_status: 'running',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    });
    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.runtime).toBe('streaming'));
    expect(result.current.activeTurnId).toBe('turn-running');
    await act(async () => result.current.stop());
    expect(cancelClinicalTurn).toHaveBeenCalledWith('thread-1', 'turn-running');
  });

  it('retries Stop when cancellation arrives before the server claims the turn', async () => {
    vi.mocked(getClinicalThread).mockResolvedValue({
      ...thread(patientA),
      active_turn_id: 'turn-running',
    });
    vi.mocked(cancelClinicalTurn)
      .mockRejectedValueOnce(new ApiError(409, { detail: 'not active yet' }))
      .mockResolvedValue({ status: 'cancelled' });
    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.runtime).toBe('streaming'));
    act(() => result.current.stop());
    await waitFor(() => expect(cancelClinicalTurn).toHaveBeenCalledTimes(2));
  });

  it('suppresses duplicate Stop requests for the same active turn', async () => {
    vi.mocked(getClinicalThread).mockResolvedValue({
      ...thread(patientA),
      active_turn_id: 'turn-running',
    });
    const response = deferred<{ status: 'cancelled' }>();
    vi.mocked(cancelClinicalTurn).mockReturnValue(response.promise);
    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.runtime).toBe('streaming'));
    act(() => {
      result.current.stop();
      result.current.stop();
    });
    expect(cancelClinicalTurn).toHaveBeenCalledTimes(1);
    await act(async () => response.resolve({ status: 'cancelled' }));
  });

  it('reconciles a completed artifact after reconnecting', async () => {
    const running = {
      ...thread(patientA),
      active_turn_id: 'turn-1',
      messages: [
        {
          id: 'user-1',
          thread_id: 'thread-1',
          turn_id: 'turn-1',
          role: 'user' as const,
          content: 'Control',
          turn_status: 'running' as const,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    vi.mocked(getClinicalThread)
      .mockResolvedValueOnce(running)
      .mockResolvedValue({
        ...running,
        active_turn_id: null,
        messages: [{ ...running.messages[0], turn_status: 'completed' }],
        artifacts: [artifact],
      });
    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.runtime).toBe('streaming'));
    await waitFor(() => expect(result.current.runtime).toBe('idle'), { timeout: 4000 });
    expect(result.current.items.filter((item) => item.type === 'draft')).toHaveLength(1);
  });

  it('hydrates persisted completion after unexpected stream failure', async () => {
    let turnId = '';
    vi.mocked(streamClinicalTurn).mockImplementation(async (_threadId, request) => {
      turnId = request.turn_id;
      throw new Error('reader failed');
    });
    vi.mocked(getClinicalThread)
      .mockResolvedValueOnce(thread(patientA))
      .mockImplementation(async () => ({
        ...thread(patientA),
        messages: [
          {
            id: 'user-persisted',
            thread_id: 'thread-1',
            turn_id: turnId,
            role: 'user',
            content: 'Control',
            turn_status: 'completed',
            created_at: '2026-09-17T12:00:00Z',
          },
        ],
        artifacts: [{ ...artifact, turn_id: turnId }],
      }));
    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.thread).not.toBeNull());
    let sent = false;
    await act(async () => {
      sent = await result.current.send('Control');
    });
    expect(sent).toBe(true);
    expect(result.current.runtime).toBe('idle');
    expect(result.current.activeTurnId).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.items.some((item) => item.type === 'draft')).toBe(true);
  });

  it('shows a persisted failed turn with its note and retry action', async () => {
    vi.mocked(getClinicalThread).mockResolvedValue({
      ...thread(patientA),
      messages: [
        {
          id: 'user-failed',
          thread_id: 'thread-1',
          turn_id: 'turn-failed',
          role: 'user',
          content: 'Nota conservada',
          turn_status: 'failed',
          turn_error_code: 'CLINICAL_TURN_CANCELLED',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    });
    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.items).toMatchObject([
      { type: 'user', content: 'Nota conservada' },
      { type: 'error', code: 'CLINICAL_TURN_CANCELLED' },
    ]);
    vi.mocked(streamClinicalTurn).mockResolvedValue(new Response(''));
    act(() => {
      result.current.retryTurn('turn-failed');
      result.current.retryTurn('turn-failed');
    });
    await waitFor(() => expect(streamClinicalTurn).toHaveBeenCalled());
    expect(streamClinicalTurn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(streamClinicalTurn).mock.calls[0][1].content).toBe('Nota conservada');
    expect(vi.mocked(streamClinicalTurn).mock.calls[0][1].retry_of_turn_id).toBe('turn-failed');
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
      expect(result.current.activeTurnId).toBe(turnId);
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

  it('recovers regeneration after an autosave rejects, but waits for the explicit save', async () => {
    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    vi.useFakeTimers();
    vi.mocked(updateClinicalArtifact).mockRejectedValueOnce(new Error('offline'));
    act(() => result.current.updateDraftDate(artifact.id, '2026-09-18T12:00:00Z'));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(result.current.artifactSyncState[artifact.id]).toBe('error');

    const explicitSave = deferred<typeof artifact>();
    vi.mocked(updateClinicalArtifact).mockReturnValueOnce(explicitSave.promise);
    let generating!: Promise<void>;
    act(() => {
      generating = result.current.regenerateDraft(result.current.items[0] as ClinicalDraftItem);
    });
    await act(async () => Promise.resolve());
    expect(updateClinicalArtifact).toHaveBeenCalledTimes(2);
    expect(regenerateClinicalDraft).not.toHaveBeenCalled();
    await act(async () => {
      explicitSave.resolve(artifact);
      await generating;
    });
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
    vi.mocked(updateClinicalArtifact).mockRejectedValueOnce(new Error('still offline'));
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
    expect(result.current.error).toBe('No pudimos guardar la evolución. Tu borrador se conserva.');
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

describe('clinical export status reconciliation', () => {
  const action: ClinicalPendingAction & { patient: ClinicalPatient } = {
    id: 'action-1',
    thread_id: 'thread-1',
    turn_id: 'turn-1',
    patient_id: patientA.id,
    action_type: 'save_evolution',
    proposal_payload: null,
    proposal_hash: 'hash',
    status: 'pending',
    expires_at: '2026-09-17T12:00:00Z',
    created_at: '2026-09-17T12:00:00Z',
    patient: patientA,
  };

  beforeEach(() => vi.resetAllMocks());

  it.each([false, true])('prepares in the current thread (failure: %s)', async (fails) => {
    vi.mocked(getClinicalThread).mockResolvedValue({ ...thread(patientA), artifacts: [artifact] });
    vi.mocked(updateClinicalArtifact).mockResolvedValue(artifact);
    if (fails) vi.mocked(prepareClinicalSave).mockRejectedValue(new Error('offline'));
    else vi.mocked(prepareClinicalSave).mockResolvedValue(action);
    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => {
      const approval = await result.current.prepareDraft(
        result.current.items[0] as ClinicalDraftItem,
      );
      expect(approval?.id ?? null).toBe(fails ? null : action.id);
    });
    expect(result.current.runtime).toBe(fails ? 'failed' : 'awaiting_approval');
    expect(result.current.items[0].status).toBe('completed');
    expect(result.current.error === null).toBe(!fails);
  });

  it.each([
    { stage: 'save', fails: false, returnToOrigin: false },
    { stage: 'save', fails: true, returnToOrigin: false },
    { stage: 'approval', fails: false, returnToOrigin: false },
    { stage: 'approval', fails: true, returnToOrigin: false },
    { stage: 'approval', fails: false, returnToOrigin: true },
    { stage: 'approval', fails: true, returnToOrigin: true },
  ])('discards preparation after navigation: %j', async ({ stage, fails, returnToOrigin }) => {
    vi.mocked(getClinicalThread).mockImplementation(async (id) => ({
      ...thread(id === 'thread-1' ? patientA : patientB),
      id,
      artifacts: id === 'thread-1' ? [artifact] : [],
    }));
    const response = deferred<null>();
    vi.mocked(updateClinicalArtifact).mockImplementation(async () => {
      if (stage === 'save') {
        await response.promise;
        if (fails) throw new Error('offline');
      }
      return artifact;
    });
    vi.mocked(prepareClinicalSave).mockImplementation(async () => {
      await response.promise;
      if (fails) throw new Error('offline');
      return action;
    });
    const { result, rerender } = renderHook(({ id }) => useClinicalAssistant(id), {
      initialProps: { id: 'thread-1' },
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    let preparing!: Promise<ClinicalApprovalItem | null>;
    act(() => {
      preparing = result.current.prepareDraft(result.current.items[0] as ClinicalDraftItem);
    });
    await waitFor(() =>
      expect(
        stage === 'save' ? updateClinicalArtifact : prepareClinicalSave,
      ).toHaveBeenCalledOnce(),
    );
    rerender({ id: 'thread-2' });
    await waitFor(() => expect(result.current.thread?.id).toBe('thread-2'));
    if (returnToOrigin) {
      rerender({ id: 'thread-1' });
      await waitFor(() => expect(result.current.thread?.id).toBe('thread-1'));
    }
    const items = result.current.items;
    await act(async () => {
      response.resolve(null);
      expect(await preparing).toBeNull();
    });
    expect(result.current.items).toBe(items);
    expect(result.current.error).toBeNull();
    expect(result.current.runtime).toBe('idle');
    if (stage === 'save') expect(prepareClinicalSave).not.toHaveBeenCalled();
    // The old operation must still release its lock so the draft can be prepared again.
    if (returnToOrigin) {
      vi.mocked(prepareClinicalSave).mockResolvedValue(action);
      await act(async () => {
        expect(
          await result.current.prepareDraft(result.current.items[0] as ClinicalDraftItem),
        ).not.toBeNull();
      });
    }
  });

  it('refreshes approved export to synced without discarding unsaved draft edits', async () => {
    const approved: ClinicalPendingAction = {
      ...action,
      status: 'approved',
      result_resource_id: 'evolution-1',
      drive_export: { status: 'pending' },
    };
    vi.mocked(getClinicalThread)
      .mockResolvedValueOnce({ ...thread(patientA), artifacts: [artifact], actions: [action] })
      .mockResolvedValue({
        ...thread(patientA),
        artifacts: [artifact],
        actions: [
          {
            ...approved,
            drive_export: {
              status: 'synced',
              journal: { period_type: 'weekly', period_key: '2026-W38', journal_part: 1 },
            },
          },
        ],
      });
    vi.mocked(resolveClinicalAction).mockResolvedValue(approved);
    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    vi.useFakeTimers();
    act(() => result.current.updateDraft(artifact.id, { ...draft, context: 'sin guardar' }));
    await act(async () => {
      await result.current.resolve(
        result.current.items.find((item) => item.type === 'approval') as ClinicalApprovalItem,
        'approve',
      );
    });
    expect(result.current.items.find((item) => item.type === 'approval')).toMatchObject({
      action: { drive_export: { status: 'pending' } },
    });
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(result.current.items.find((item) => item.type === 'approval')).toMatchObject({
      action: { drive_export: { status: 'synced', journal: { journal_part: 1 } } },
    });
    expect(result.current.items.find((item) => item.type === 'draft')).toMatchObject({
      draft: { context: 'sin guardar' },
    });
    vi.mocked(getClinicalThread).mockClear();
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(getClinicalThread).not.toHaveBeenCalled();
  });

  it('refreshes a recovery request until export fails', async () => {
    const failed: ClinicalPendingAction = {
      ...action,
      status: 'approved',
      result_resource_id: 'evolution-1',
      drive_export: { status: 'failed', error_code: 'DRIVE_UNAVAILABLE' },
    };
    vi.mocked(getClinicalThread)
      .mockResolvedValueOnce({ ...thread(patientA), actions: [failed] })
      .mockResolvedValue({ ...thread(patientA), actions: [failed] });
    vi.mocked(retryClinicalDriveExport).mockResolvedValue({ drive_export: { status: 'pending' } });
    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    vi.useFakeTimers();
    await act(async () => result.current.retryDriveExport('evolution-1'));
    expect(result.current.items[0]).toMatchObject({
      action: { drive_export: { status: 'pending' } },
    });
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(result.current.items[0]).toMatchObject({
      action: { drive_export: { status: 'failed', error_code: 'DRIVE_UNAVAILABLE' } },
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

  it('keeps a streamed switch until persisted, then trusts the server resolution', async () => {
    const initial = thread(patientA);
    let turnId = '';
    const persistedMessage = (resolution: 'pending' | 'changed_patient') => ({
      id: 'user-1',
      thread_id: 'thread-1',
      turn_id: turnId,
      role: 'user' as const,
      content: 'Actualizar a Bruno',
      created_at: '2026-01-01T00:00:00Z',
      patient_switch: {
        item_id: 'switch-1',
        current_patient: patientA,
        detected_patient: patientB,
        resolution,
      },
    });
    vi.mocked(getClinicalThread)
      .mockResolvedValueOnce(initial)
      .mockImplementationOnce(async () => ({
        ...initial,
        messages: [persistedMessage('pending')],
      }))
      .mockImplementation(async () => ({
        ...thread(patientB),
        messages: [persistedMessage('changed_patient')],
      }));
    vi.mocked(streamClinicalTurn).mockImplementation(async (_threadId, request) => {
      turnId = request.turn_id;
      return new Response(
        `event: patient.switch_required\ndata: ${JSON.stringify({
          schema_version: 1,
          event_id: 'event-1',
          sequence: 1,
          thread_id: 'thread-1',
          turn_id: turnId,
          item_id: 'switch-1',
          item_type: 'patient.switch_required',
          status: 'pending',
          data: { current_patient: patientA, detected_patient: patientB },
        })}\n\n`,
      );
    });

    const { result } = renderHook(() => useClinicalAssistant('thread-1'));
    await waitFor(() => expect(result.current.thread).not.toBeNull());
    await act(async () => {
      await result.current.send('Actualizar a Bruno');
    });
    expect(result.current.items.find((item) => item.type === 'patient_switch')).toMatchObject({
      resolution: 'pending',
      createdAt: '2026-01-01T00:00:00Z',
    });

    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.items.filter((item) => item.type === 'patient_switch')).toMatchObject([
      { id: 'switch-1', status: 'completed', resolution: 'changed_patient' },
    ]);
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

describe('clinical stop subscription isolation', () => {
  type HookResult = { current: ReturnType<typeof useClinicalAssistant> };
  const cancels: Array<ReturnType<typeof deferred<{ status: 'cancelled' }>>> = [];
  let streamCalls: Array<{ turnId: string; signal: AbortSignal }> = [];
  let rejectStop: ((reason?: unknown) => void) | null = null;

  beforeEach(() => {
    vi.resetAllMocks();
    cancels.length = 0;
    streamCalls = [];
    rejectStop = null;
    vi.mocked(getClinicalThread).mockImplementation(async (id) => ({
      ...thread(id === 'thread-1' ? patientA : patientB),
      id,
      active_turn_id: null,
    }));
    vi.mocked(streamClinicalTurn).mockImplementation((_id, request, signal) => {
      streamCalls.push({ turnId: request.turn_id, signal: signal as AbortSignal });
      return new Promise<Response>(() => {}); // pending; only the client controller matters
    });
    vi.mocked(cancelClinicalTurn).mockImplementation(() => {
      const entry = deferred<{ status: 'cancelled' }>();
      cancels.push(entry);
      return entry.promise;
    });
  });

  function renderAssistant(initialThreadId: string) {
    return renderHook(({ id }) => useClinicalAssistant(id), {
      initialProps: { id: initialThreadId },
    });
  }

  // The send promise stays pending while the turn is live, so this must stay
  // synchronous; returning it from an async helper would deadlock the test.
  function startTurn(result: HookResult, text: string): void {
    act(() => {
      void result.current.send(text);
    });
    expect(result.current.runtime).toBe('streaming');
  }

  const settleCancel = (index: number) =>
    act(async () => {
      cancels[index].resolve({ status: 'cancelled' });
      await cancels[index].promise;
      await Promise.resolve();
    });

  // Double Stop for A, then switch to B and start B. Dedupe must leave exactly
  // one cancel in flight for A.
  async function stopThenSwitchToB() {
    const { result, rerender } = renderAssistant('thread-1');
    await waitFor(() => expect(result.current.thread?.id).toBe('thread-1'));
    startTurn(result, 'Nota A');
    act(() => {
      result.current.stop();
      result.current.stop();
    });
    await waitFor(() => expect(cancelClinicalTurn).toHaveBeenCalledTimes(1));

    rerender({ id: 'thread-2' });
    await waitFor(() => expect(result.current.thread?.id).toBe('thread-2'));
    startTurn(result, 'Nota B');
    const controllerB = streamCalls[streamCalls.length - 1].signal;
    const turnB = streamCalls[streamCalls.length - 1].turnId;
    return { result, controllerB, turnB };
  }

  it.each(['resolve', 'reject'] as const)(
    'does not mutate B when deferred Stop for A %ss after B starts',
    async (outcome) => {
      if (outcome === 'reject') {
        vi.mocked(cancelClinicalTurn).mockImplementationOnce(
          () =>
            new Promise<{ status: 'cancelled' }>((_resolve, reject) => {
              rejectStop = reject;
            }),
        );
      }
      const { result, controllerB, turnB } = await stopThenSwitchToB();

      await act(async () => {
        if (outcome === 'resolve') cancels[0].resolve({ status: 'cancelled' });
        else rejectStop?.(new Error('stop transport failed'));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(controllerB.aborted).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.runtime).toBe('streaming');
      expect(result.current.activeTurnId).toBe(turnB);
      expect(cancelClinicalTurn).toHaveBeenCalledTimes(1);
      expect(
        result.current.items.some((item) => item.type === 'user' && item.content === 'Nota B'),
      ).toBe(true);
    },
  );

  it('ignores a late Stop from an earlier subscription of the same thread', async () => {
    const { result, rerender } = renderAssistant('thread-1');
    await waitFor(() => expect(result.current.thread?.id).toBe('thread-1'));
    startTurn(result, 'Nota A1');
    act(() => result.current.stop());
    await waitFor(() => expect(cancelClinicalTurn).toHaveBeenCalledTimes(1));

    rerender({ id: 'thread-2' });
    await waitFor(() => expect(result.current.thread?.id).toBe('thread-2'));
    rerender({ id: 'thread-1' });
    await waitFor(() => expect(result.current.thread?.id).toBe('thread-1'));
    startTurn(result, 'Nota A2');
    const controllerA2 = streamCalls[streamCalls.length - 1].signal;

    await settleCancel(0);

    // Same thread id, new subscription generation: A1's callbacks must not
    // reload A2's transcript back to an empty history nor abort A2's controller.
    expect(
      result.current.items.some((item) => item.type === 'user' && item.content === 'Nota A2'),
    ).toBe(true);
    expect(controllerA2.aborted).toBe(false);
    expect(result.current.runtime).toBe('streaming');
  });

  it("keeps B's in-flight Stop scoped when A's Stop cleanup runs", async () => {
    const { result, controllerB } = await stopThenSwitchToB();
    act(() => result.current.stop());
    await waitFor(() => expect(cancelClinicalTurn).toHaveBeenCalledTimes(2));
    expect(result.current.runtime).toBe('stopping');

    await settleCancel(0);

    // A's cleanup must not clear B's dedupe marker nor abort B's controller.
    expect(result.current.runtime).toBe('stopping');
    expect(cancelClinicalTurn).toHaveBeenCalledTimes(2);
    expect(controllerB.aborted).toBe(false);

    await settleCancel(1);
  });

  it('detaches and unmounts without cancelling server work', async () => {
    const { result, unmount } = renderAssistant('thread-1');
    await waitFor(() => expect(result.current.thread?.id).toBe('thread-1'));
    startTurn(result, 'Nota A');
    act(() => result.current.detach());
    expect(streamCalls[streamCalls.length - 1].signal.aborted).toBe(true);
    expect(cancelClinicalTurn).not.toHaveBeenCalled();
    unmount();
    expect(cancelClinicalTurn).not.toHaveBeenCalled();
  });
});

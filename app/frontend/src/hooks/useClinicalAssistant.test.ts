import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ClinicalDraft,
  type ClinicalPatient,
  type ClinicalThread,
  getClinicalThread,
  setClinicalActivePatient,
  updateClinicalArtifact,
} from '../lib/api';
import { useClinicalAssistant } from './useClinicalAssistant';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    getClinicalThread: vi.fn(),
    setClinicalActivePatient: vi.fn(),
    updateClinicalArtifact: vi.fn(),
  };
});

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

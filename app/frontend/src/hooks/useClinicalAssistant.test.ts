import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ClinicalPatient,
  type ClinicalThread,
  getClinicalThread,
  setClinicalActivePatient,
} from '../lib/api';
import { useClinicalAssistant } from './useClinicalAssistant';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    getClinicalThread: vi.fn(),
    setClinicalActivePatient: vi.fn(),
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
});

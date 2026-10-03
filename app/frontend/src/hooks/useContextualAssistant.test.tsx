import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { useContextualAssistant } from './useContextualAssistant';

const runtime = vi.hoisted(() => ({
  activeThreadId: null,
  activate: vi.fn(),
  controller: { detach: vi.fn() },
}));
vi.mock('../components/ClinicalRuntimeProvider', () => ({
  useOptionalClinicalRuntime: () => runtime,
  useClinicalComposerMemory: () => null,
}));
afterEach(() => vi.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

it('closes the panel when patient or evolution context changes', async () => {
  vi.spyOn(api, 'openClinicalContext').mockResolvedValue({
    thread: { id: 'thread-a' },
  } as Awaited<ReturnType<typeof api.openClinicalContext>>);
  const { result, rerender } = renderHook(
    ({ patientId, evolutionId }) =>
      useContextualAssistant({ surface: 'patient_detail', patientId, evolutionId }),
    { wrapper, initialProps: { patientId: 'a', evolutionId: '' } },
  );
  await act(() => result.current.open());
  expect(result.current.panelThreadId).toBe('thread-a');
  rerender({ patientId: 'b', evolutionId: '' });
  expect(result.current.panelThreadId).toBeNull();
  await act(() => result.current.open());
  rerender({ patientId: 'b', evolutionId: 'e' });
  expect(result.current.panelThreadId).toBeNull();
});

it('ignores late responses without unlocking a newer context request', async () => {
  type Response = Awaited<ReturnType<typeof api.openClinicalContext>>;
  let resolveOld!: (value: Response) => void;
  let resolveNew!: (value: Response) => void;
  const open = vi
    .spyOn(api, 'openClinicalContext')
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNew = resolve;
        }),
    );
  const { result, rerender } = renderHook(
    (patientId) => useContextualAssistant({ surface: 'patient_detail', patientId }),
    { wrapper, initialProps: 'a' },
  );
  act(() => {
    void result.current.open();
  });
  rerender('b');
  expect(result.current.opening).toBe(false);
  act(() => {
    void result.current.open();
  });
  await act(async () => {
    resolveOld({ thread: { id: 'old' } } as Response);
  });
  expect(result.current.panelThreadId).toBeNull();
  expect(result.current.opening).toBe(true);
  await act(() => result.current.open());
  expect(open).toHaveBeenCalledTimes(2);
  await act(async () => {
    resolveNew({ thread: { id: 'new' } } as Response);
  });
  expect(result.current.panelThreadId).toBe('new');
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError, type DentalClinicalNote } from '../lib/api';
import { useDentalClinicalNotes } from './useDentalClinicalNotes';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  templates: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('../lib/api', async () => ({
  ...(await vi.importActual('../lib/api')),
  getDentalClinicalNotes: mocks.list,
  getDentalNoteTemplates: mocks.templates,
  createDentalClinicalNote: mocks.create,
  editDentalClinicalNote: mocks.edit,
  deleteDentalClinicalNote: mocks.remove,
}));
const context = { note_type: 'diagnosis', entity_kind: 'patient', entity_id: 'p' } as const;
const note = {
  id: 'n',
  body: 'Saved',
  revision: 1,
  tooth_fdi: 16,
  dentition: 'permanent',
  note_type: 'diagnosis',
  entity_kind: 'patient',
  entity_id: 'p',
  linked_teeth: [16],
} as DentalClinicalNote;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue({ items: [], total: 0, next_cursor: null });
  mocks.templates.mockResolvedValue({ items: [] });
});

it('preserves unbound candidate across leave and reentry; changes re-enable binding', async () => {
  const { result } = renderHook(() => useDentalClinicalNotes('p', context));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.candidateFromChart(16, 'permanent'));
  act(() => result.current.setBound(false));
  act(() => {
    result.current.candidateFromChart(0, 'permanent');
    result.current.candidateFromChart(16, 'permanent');
  });
  expect(result.current.candidate?.tooth).toBe(16);
  expect(result.current.bound).toBe(false);
  act(() => result.current.candidateFromChart(17, 'permanent'));
  expect(result.current.bound).toBe(true);
});

it('keeps a free-text draft bound to the chosen tooth and retries the exact payload', async () => {
  mocks.create
    .mockRejectedValueOnce(new TypeError('Lost response'))
    .mockResolvedValueOnce({ committed: note });
  const { result } = renderHook(() => useDentalClinicalNotes('p', context));
  act(() => result.current.candidateFromChart(17, 'permanent'));
  act(() => result.current.setBody('Existing'));
  act(() => result.current.candidateFromChart(18, 'permanent'));
  expect(result.current.candidate?.tooth).toBe(17);
  await act(async () => {
    await result.current.save();
  });
  expect(result.current.body).toBe('Existing');
  await act(async () => {
    await result.current.retry();
  });
  expect(mocks.create.mock.calls[0][1]).toEqual(mocks.create.mock.calls[1][1]);
  expect(mocks.create.mock.calls[0][1].tooth_fdi).toBe(17);
  expect(result.current.body).toBe('');
  expect(mocks.templates).not.toHaveBeenCalled();
});

it('edits body only and requires explicit conflict reconciliation', async () => {
  const latest = { ...note, revision: 2, body: 'Remote' };
  mocks.edit
    .mockRejectedValueOnce(new ApiError(409, { detail: { latest } }))
    .mockResolvedValueOnce({ committed: { ...latest, body: 'Local' } });
  const { result } = renderHook(() => useDentalClinicalNotes('p', context));
  act(() => result.current.edit(note));
  act(() => {
    result.current.setBody('Local');
    result.current.candidateFromChart(17, 'permanent');
  });
  await act(async () => {
    await result.current.save();
  });
  expect(result.current.body).toBe('Local');
  expect(result.current.editing?.tooth_fdi).toBe(16);
  expect(mocks.edit.mock.calls[0][2]).not.toHaveProperty('tooth_fdi');
  act(() => result.current.reconcile());
  await act(async () => {
    await result.current.save();
  });
  expect(mocks.edit.mock.calls[1][2].expected_revision).toBe(2);
});

it('keeps existing feed and reports incomplete page rather than false empty', async () => {
  mocks.list
    .mockResolvedValueOnce({ items: [note], total: 21, next_cursor: 'next' })
    .mockRejectedValueOnce(new TypeError('Unavailable'));
  const { result } = renderHook(() => useDentalClinicalNotes('p', context));
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  await act(async () => {
    await result.current.load('next');
  });
  expect(result.current.items).toHaveLength(1);
  expect(result.current.readError).toBe(true);
});

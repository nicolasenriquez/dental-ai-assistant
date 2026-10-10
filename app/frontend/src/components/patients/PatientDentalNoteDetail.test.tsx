import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { PatientDentalNoteDetail } from './PatientDentalNoteDetail';

const mocks = vi.hoisted(() => ({ detail: vi.fn(), revisions: vi.fn() }));
vi.mock('../../lib/api', async () => ({
  ...(await vi.importActual('../../lib/api')),
  getDentalClinicalNote: mocks.detail,
  getDentalClinicalNoteRevisions: mocks.revisions,
}));
afterEach(() => vi.resetAllMocks());

const note = {
  id: '00000000-0000-4000-8000-0000000000b1',
  note_type: 'diagnosis' as const,
  entity_kind: 'patient' as const,
  entity_id: 'patient',
  entity_label: null,
  tooth_fdi: 36,
  dentition: 'permanent' as const,
  linked_teeth: [36],
  body: 'Nota clínica sintética',
  revision: 2,
  created_by: 'user',
  created_at: '2026-10-03T12:00:00Z',
  updated_at: '2026-10-03T12:00:00Z',
  deleted_at: null,
};
const revision = {
  id: '00000000-0000-4000-8000-0000000000b2',
  revision: 2,
  action: 'edited' as const,
  changed_at: '2026-10-03T12:00:00Z',
  actor_user_id: '00000000-0000-4000-8000-000000000001',
  actor_display_name: null,
};

it('focuses the exact clinical note destination once after the owned read', async () => {
  mocks.detail.mockResolvedValue(note);
  mocks.revisions.mockResolvedValue({ items: [revision], total: 1, next_cursor: 'next' });
  render(<PatientDentalNoteDetail patientId="patient" noteId={note.id} />);
  const destination = await screen.findByRole('region', { name: 'Nota clínica seleccionada' });
  await waitFor(() => {
    expect(destination).toHaveFocus();
  });
  expect(mocks.detail).toHaveBeenCalledWith('patient', note.id);
  expect(await screen.findByText('Nota clínica sintética')).toBeVisible();
  const more = screen.getByRole('button', { name: 'Cargar más revisiones de nota' });
  more.focus();
  fireEvent.click(more);
  await waitFor(() => expect(mocks.revisions).toHaveBeenCalledTimes(2));
  expect(more).toHaveFocus();
});

it('keeps a recoverable error and no fabricated empty history when the exact note is unavailable', async () => {
  mocks.detail.mockRejectedValue(new ApiError(404, {}));
  mocks.revisions.mockRejectedValue(new ApiError(404, {}));
  render(<PatientDentalNoteDetail patientId="patient" noteId={note.id} />);
  expect(
    await screen.findByText('Nota clínica o historial no disponible para este paciente.'),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Reintentar nota clínica' })).toBeVisible();
  expect(screen.queryByText(/Revisión 2/)).not.toBeInTheDocument();
});

it('uses each revision actor display name and a distinguishable UUID fallback', async () => {
  const named = {
    ...revision,
    id: '00000000-0000-4000-8000-0000000000c1',
    revision: 3,
    actor_user_id: '00000000-0000-4000-8000-0000000000c1',
    actor_display_name: 'Dra. Rojas',
  };
  const anonymousA = {
    ...revision,
    revision: 2,
    actor_user_id: '00000000-0000-4000-8000-000000000001',
  };
  const anonymousB = {
    ...revision,
    id: '00000000-0000-4000-8000-0000000000b3',
    revision: 1,
    actor_user_id: '00000000-0000-4000-8000-000000000002',
  };
  mocks.detail.mockResolvedValue(note);
  mocks.revisions.mockResolvedValue({
    items: [named, anonymousA, anonymousB],
    total: 3,
    next_cursor: null,
  });
  render(<PatientDentalNoteDetail patientId="patient" noteId={note.id} />);
  expect(await screen.findByText('Dra. Rojas')).toBeVisible();
  expect(screen.queryByText('Autor no disponible')).toBeNull();
  const fallbacks = await screen.findAllByText(/^Usuario /);
  expect(new Set(fallbacks.map((node) => node.textContent)).size).toBe(2);
  expect(
    fallbacks.every((node) => (node.textContent?.length ?? 0) > 'Usuario 00000000'.length),
  ).toBe(true);
});

it('keeps revision history for a logically deleted exact note', async () => {
  mocks.detail.mockResolvedValue({ ...note, revision: 3, deleted_at: '2026-10-05T12:00:00Z' });
  mocks.revisions.mockResolvedValue({
    items: [{ ...revision, action: 'deleted' }],
    total: 1,
    next_cursor: null,
  });
  render(<PatientDentalNoteDetail patientId="patient" noteId={note.id} />);
  expect(await screen.findByText(/Eliminada; su historial se conserva\./)).toBeVisible();
  expect(screen.getByText(/Nota eliminada/)).toBeVisible();
  expect(mocks.revisions).toHaveBeenCalledWith('patient', note.id, undefined);
});

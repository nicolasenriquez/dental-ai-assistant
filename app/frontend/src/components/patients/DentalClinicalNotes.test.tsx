import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useDentalClinicalNotes } from '../../hooks/useDentalClinicalNotes';
import type { DentalClinicalNote } from '../../lib/api';
import { ApiError } from '../../lib/api';
import { DentalClinicalNotes } from './DentalClinicalNotes';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  templates: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('../../lib/api', async () => ({
  ...(await vi.importActual('../../lib/api')),
  getDentalClinicalNotes: mocks.list,
  getDentalNoteTemplates: mocks.templates,
  createDentalClinicalNote: mocks.create,
  editDentalClinicalNote: mocks.edit,
  deleteDentalClinicalNote: mocks.remove,
}));
const note = {
  id: 'n',
  body: 'Texto clínico',
  revision: 1,
  tooth_fdi: 16,
  dentition: 'permanent',
  note_type: 'diagnosis',
  entity_kind: 'patient',
  entity_id: 'p',
  entity_label: null,
  created_by: 'u',
  created_at: '2026-10-07T12:00:00Z',
  updated_at: '2026-10-07T12:00:00Z',
  deleted_at: null,
  linked_teeth: [16],
} satisfies DentalClinicalNote;
function Harness({ highlight = vi.fn() }: { highlight?: (teeth: number[]) => void }): JSX.Element {
  const notes = useDentalClinicalNotes('p', {
    note_type: 'diagnosis',
    entity_kind: 'patient',
    entity_id: 'p',
  });
  return (
    <>
      <button type="button" onClick={() => notes.candidateFromChart(16, 'permanent')}>
        Diente 16
      </button>
      <DentalClinicalNotes notes={notes} onHighlight={highlight} />
    </>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue({ items: [], total: 0, next_cursor: null });
  mocks.templates.mockResolvedValue({
    items: [
      { id: 'caries', category: 'diagnosis', label: 'Caries', body: 'Hallazgo:\nProfundidad:' },
    ],
  });
});

it('offers free text without templates and saves optional binding only on Guardar', async () => {
  mocks.create.mockResolvedValue({ committed: note });
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Diente 16' }));
  fireEvent.change(screen.getByLabelText('Texto de nota clínica'), {
    target: { value: 'Observación' },
  });
  expect(screen.queryByLabelText('Plantillas')).not.toBeInTheDocument();
  expect(mocks.templates).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Asociar al diente 16' }));
  expect(mocks.create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  expect(mocks.create.mock.calls[0][1]).not.toHaveProperty('tooth_fdi');
  await screen.findByRole('button', { name: 'Añadir nota' });
});

it('highlights all treatment members and expands 280-character preview; deletion requires confirmation', async () => {
  mocks.list.mockResolvedValue({
    items: [
      {
        ...note,
        note_type: 'treatment',
        tooth_fdi: null,
        entity_kind: 'treatment',
        entity_id: 't',
        linked_teeth: [16, 17, 18],
        body: `${'x'.repeat(280)}Final visible`,
      },
    ],
    total: 1,
    next_cursor: null,
  });
  mocks.remove.mockResolvedValue({ committed: { ...note, deleted_at: '2026-10-07' } });
  const highlight = vi.fn();
  render(<Harness highlight={highlight} />);
  const card = await screen.findByRole('article', { name: 'Nota Tratamiento' });
  fireEvent.mouseEnter(card);
  expect(highlight).toHaveBeenLastCalledWith([16, 17, 18]);
  expect(screen.queryByText(/Final visible/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver más' }));
  expect(screen.getByText(/Final visible/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar nota' }));
  expect(mocks.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }));
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledOnce());
});

it('reviews a deletion conflict explicitly and replays a lost deletion response exactly', async () => {
  mocks.list.mockResolvedValue({ items: [note], total: 1, next_cursor: null });
  mocks.remove
    .mockRejectedValueOnce(
      new ApiError(409, {
        detail: { latest: { ...note, body: 'Texto actualizado', revision: 2 } },
      }),
    )
    .mockRejectedValueOnce(new TypeError('Lost response'))
    .mockResolvedValueOnce({
      committed: { ...note, revision: 3, deleted_at: '2026-10-07T12:01:00Z' },
    });
  render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar nota' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }));
  await screen.findByText('Versión guardada: Texto actualizado');
  expect(screen.getByRole('button', { name: 'Reintentar eliminación' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Revisar eliminación de versión actual' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }));
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Reintentar eliminación' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar eliminación' }));
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(3));
  expect(mocks.remove.mock.calls[1][2].expected_revision).toBe(2);
  expect(mocks.remove.mock.calls[2][2]).toEqual(mocks.remove.mock.calls[1][2]);
});

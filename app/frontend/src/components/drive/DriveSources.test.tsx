import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { openDrivePicker } from '../../lib/drivePicker';
import { DriveWorkspace } from './DriveWorkspace';

vi.mock('../../lib/api', async (original) => ({
  ...(await original<typeof import('../../lib/api')>()),
  getDriveStatus: vi.fn(),
  listDriveFiles: vi.fn(),
  listDriveSources: vi.fn(),
  getDriveSource: vi.fn(),
  getDriveSourceText: vi.fn(),
  updateDriveSourceText: vi.fn(),
  importDriveCopy: vi.fn(),
}));
vi.mock('../../lib/drivePicker', () => ({ openDrivePicker: vi.fn() }));

const source: api.DriveSourceTextContent = {
  id: 'source',
  name: 'notas.md',
  mimeType: 'text/markdown',
  kind: 'markdown',
  version: '1',
  editable: true,
  modifiedTime: '2026-09-12T12:00:00Z',
  content: 'Alpha\nBeta\nAlpha',
};
const patient = { id: 'a', displayName: 'Alpha', rutMasked: '****1234' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getDriveStatus).mockResolvedValue({
    configured: true,
    status: 'connected',
    workspace: { folder_name: 'Dental' },
  });
  vi.mocked(api.listDriveFiles).mockResolvedValue({ files: [], next_page_token: null });
  vi.mocked(api.listDriveSources).mockResolvedValue({ files: [source], next_page_token: null });
  vi.mocked(api.getDriveSource).mockResolvedValue(source);
  vi.mocked(api.getDriveSourceText).mockResolvedValue(source);
  vi.mocked(api.updateDriveSourceText).mockImplementation(async (_, content) => ({
    ...source,
    content,
    version: '2',
  }));
  vi.mocked(openDrivePicker).mockResolvedValue({ id: source.id });
});

it('opens editable sources from Picker without importing or binding a patient', async () => {
  render(<DriveWorkspace patientId="a" patient={patient} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Abrir desde Drive' }));
  expect(
    await screen.findByRole('textbox', { name: 'Contenido del documento' }),
  ).not.toHaveAttribute('readonly');
  expect(openDrivePicker).toHaveBeenCalledWith();
  expect(api.importDriveCopy).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
});

it('preserves source edits and exact selection across patient changes, then saves original', async () => {
  const insert = vi.fn();
  const dirty = vi.fn();
  const props = { onInsertToComposer: insert, onDirtyStateChange: dirty };
  const { rerender } = render(<DriveWorkspace patientId="a" patient={patient} {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: /notas.md/ }));
  const editor = (await screen.findByRole('textbox', {
    name: 'Contenido del documento',
  })) as HTMLTextAreaElement;
  fireEvent.change(editor, { target: { value: '  Exact\nBeta  ' } });
  editor.setSelectionRange(0, 7);
  fireEvent.select(editor);
  expect(insert).not.toHaveBeenCalled();
  rerender(
    <DriveWorkspace
      patientId="b"
      patient={{ ...patient, id: 'b', displayName: 'Beta' }}
      {...props}
    />,
  );
  expect(editor).toHaveValue('  Exact\nBeta  ');
  expect(screen.getByText('Beta · ****1234')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Incorporar al borrador' }));
  expect(insert).toHaveBeenCalledWith('Fuente: Google Drive · notas.md\n  Exact');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() =>
    expect(api.updateDriveSourceText).toHaveBeenCalledWith('source', '  Exact\nBeta  ', '1'),
  );
  await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(false));
  expect(api.getDriveSourceText).toHaveBeenCalledTimes(1);
});

it('allows browsing without a patient, searches locally and guards dirty Back', async () => {
  const guard = vi.fn();
  render(<DriveWorkspace patientId={null} guardTransition={guard} />);
  fireEvent.click(await screen.findByRole('button', { name: /notas.md/ }));
  const editor = (await screen.findByRole('textbox', {
    name: 'Contenido del documento',
  })) as HTMLTextAreaElement;
  editor.setSelectionRange(6, 10);
  fireEvent.select(editor);
  expect(screen.getByRole('button', { name: 'Incorporar al borrador' })).toBeDisabled();
  fireEvent.keyDown(editor, { ctrlKey: true, key: 'f' });
  const search = screen.getByRole('searchbox', { name: 'Buscar dentro del documento' });
  fireEvent.change(search, { target: { value: 'Alpha' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(editor.selectionStart).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Coincidencia siguiente' }));
  expect(editor.selectionStart).toBe(11);
  expect(screen.queryByRole('button', { name: 'Incorporar al borrador' })).toBeNull();
  fireEvent.change(editor, { target: { value: 'dirty' } });
  fireEvent.click(screen.getByRole('button', { name: 'Volver a Google Drive' }));
  expect(guard).toHaveBeenCalled();
});

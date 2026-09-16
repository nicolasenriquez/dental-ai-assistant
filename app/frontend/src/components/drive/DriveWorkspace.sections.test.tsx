/**
 * Behavior tests for the Drive information architecture and composer insertion (tasks 3.1-3.3).
 *
 * The existing Drive source and managed-document primitives remain the seams.
 * Task 3.2 supplies the three-section shell and task 3.3 supplies insertion.
 * These tests keep global Notes independent from patient-bound Documents and
 * make the two Picker outcomes observable without prescribing implementation
 * details of the Picker helper.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { openDrivePicker } from '../../lib/drivePicker';
import { DriveWorkspace } from './DriveWorkspace';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    getDriveStatus: vi.fn(),
    listDriveFiles: vi.fn(),
    searchDriveFiles: vi.fn(),
    getDriveFile: vi.fn(),
    createDriveFile: vi.fn(),
    updateDriveFile: vi.fn(),
    listDriveSources: vi.fn(),
    getDriveSource: vi.fn(),
    getDriveSourceText: vi.fn(),
    updateDriveSourceText: vi.fn(),
    importDriveCopy: vi.fn(),
    recreateDriveWorkspace: vi.fn(),
    startDriveOAuth: vi.fn(),
  };
});

vi.mock('../../lib/drivePicker', () => ({ openDrivePicker: vi.fn() }));

const connectedStatus: api.DriveStatus = {
  configured: true,
  status: 'connected',
  workspace: { folder_name: 'Dental AI Assistant' },
};

const patientA = { id: 'p1', displayName: 'Ana Pérez', rutMasked: '12.345.•••-6' };
const patientB = { id: 'p2', displayName: 'Bruno Gómez', rutMasked: '9.876.•••-1' };

const source: api.DriveSourceTextContent = {
  id: 'source-1',
  name: 'Nota clínica.md',
  mimeType: 'text/markdown',
  modifiedTime: '2026-09-12T12:00:00Z',
  version: '1',
  kind: 'markdown',
  editable: true,
  webViewLink: 'https://docs.google.com/document/d/source-1/edit',
  content: 'Nota global de referencia',
};

const managedFile: api.DriveFileContent = {
  id: 'managed-1',
  name: 'Evolución previa.txt',
  version: '4',
  mimeType: 'text/plain',
  modifiedTime: '2026-09-12T12:00:00Z',
  content: 'Contenido administrado de Ana',
};

const journalPage = {
  journals: [
    {
      period_type: 'weekly',
      period_key: '2026-W37',
      journal_part: 1,
      display_name: 'Evoluciones — 2026-W37.txt',
      updated_at: '2026-09-12T12:00:00Z',
    },
  ],
};

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const path = String(input).split('?')[0];
    const body =
      path === '/api/google-drive/evolution-journals'
        ? journalPage
        : path === '/api/google-drive/evolution-journals/preferences'
          ? { frequency: 'weekly' }
          : {};
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  });

  vi.mocked(api.getDriveStatus).mockResolvedValue(connectedStatus);
  vi.mocked(api.listDriveSources).mockResolvedValue({ files: [source], next_page_token: null });
  vi.mocked(api.getDriveSource).mockResolvedValue(source);
  vi.mocked(api.getDriveSourceText).mockResolvedValue(source);
  vi.mocked(api.listDriveFiles).mockResolvedValue({ files: [], next_page_token: null });
  vi.mocked(api.searchDriveFiles).mockResolvedValue({ files: [], next_page_token: null });
  vi.mocked(api.getDriveFile).mockResolvedValue(managedFile);
  vi.mocked(api.importDriveCopy).mockResolvedValue(managedFile);
  vi.mocked(openDrivePicker).mockResolvedValue({
    id: source.id,
    name: source.name,
    mimeType: source.mimeType,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWorkspace(
  patientId: string | null = 'p1',
  onInsertToComposer?: (text: string) => void,
) {
  return render(
    <DriveWorkspace
      patientId={patientId}
      patient={patientId ? patientA : null}
      onInsertToComposer={onInsertToComposer}
    />,
  );
}

async function selectSection(name: 'Notas' | 'Documentos' | 'Diarios') {
  const section = await screen.findByRole('button', { name: new RegExp(`^${name}$`) });
  fireEvent.click(section);
  return section;
}

describe('Drive section boundaries', () => {
  it('keeps global Notes listable, searchable, and readable without a patient', async () => {
    renderWorkspace(null);

    const notes = await selectSection('Notas');
    expect(notes).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('searchbox', { name: 'Buscar notas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nota clínica\.md/ })).toBeInTheDocument();
    expect(api.listDriveSources).toHaveBeenCalledWith(undefined);
    expect(api.listDriveFiles).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar notas' }), {
      target: { value: 'clínica' },
    });
    expect(screen.getByRole('button', { name: /Nota clínica\.md/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Nota clínica\.md/ }));
    const editor = await screen.findByRole('textbox', { name: 'Contenido del documento' });
    expect(editor).toHaveValue(source.content);
    expect(api.getDriveSourceText).toHaveBeenCalledWith(source.id);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows Documents prerequisite state instead of an error without a patient', async () => {
    renderWorkspace(null);

    await selectSection('Documentos');

    expect(await screen.findByText('Seleccionar paciente')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.listDriveFiles).not.toHaveBeenCalled();
  });

  it('shows the patient-bound Documents empty state for an active patient', async () => {
    renderWorkspace('p1');

    await selectSection('Documentos');

    expect(await screen.findByText('Aún no hay documentos')).toBeInTheDocument();
    expect(
      screen.getByText(`Contexto activo · ${patientA.displayName} · ${patientA.rutMasked}`),
    ).toBeInTheDocument();
    expect(api.listDriveFiles).toHaveBeenCalledWith('p1', undefined);
  });

  it('keeps Journals readable across patients and does not require patient context', async () => {
    const view = renderWorkspace(null);

    const journals = await selectSection('Diarios');
    expect(journals).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Evoluciones — 2026-W37.txt')).toBeInTheDocument();
    expect(screen.queryByText('Seleccionar paciente')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/google-drive/evolution-journals',
      expect.objectContaining({ credentials: 'include' }),
    );

    view.rerender(<DriveWorkspace patientId="p2" patient={patientB} />);

    expect(await screen.findByText('Evoluciones — 2026-W37.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diarios' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps an open global note and its local work when patient changes', async () => {
    const view = renderWorkspace(null);

    await selectSection('Notas');
    fireEvent.click(await screen.findByRole('button', { name: /Nota clínica\.md/ }));
    const editor = (await screen.findByRole('textbox', {
      name: 'Contenido del documento',
    })) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'Edición global local' } });

    view.rerender(<DriveWorkspace patientId="p2" patient={patientB} />);

    expect(await screen.findByRole('textbox', { name: 'Contenido del documento' })).toHaveValue(
      'Edición global local',
    );
    expect(api.getDriveSourceText).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Documento administrado de Bruno/)).not.toBeInTheDocument();
  });

  it('clears a patient-bound document on patient change instead of relabeling it', async () => {
    vi.mocked(api.listDriveFiles).mockImplementation(async (patientId) => ({
      files: patientId === 'p1' ? [managedFile] : [],
      next_page_token: null,
    }));
    const view = renderWorkspace('p1');

    await selectSection('Documentos');
    fireEvent.click(await screen.findByRole('button', { name: managedFile.name }));
    expect(await screen.findByText(managedFile.content)).toBeInTheDocument();

    view.rerender(<DriveWorkspace patientId="p2" patient={patientB} />);

    await waitFor(() => expect(api.listDriveFiles).toHaveBeenLastCalledWith('p2', undefined));
    expect(screen.queryByText(managedFile.content)).not.toBeInTheDocument();
    expect(await screen.findByText('Aún no hay documentos')).toBeInTheDocument();
  });
});

describe('Drive Picker intents', () => {
  it('opens a selected global note without importing a managed copy', async () => {
    renderWorkspace(null);

    await selectSection('Notas');
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir desde Drive' }));

    expect(openDrivePicker).toHaveBeenCalledTimes(1);
    expect(openDrivePicker).toHaveBeenCalledWith();
    expect(await screen.findByRole('textbox', { name: 'Contenido del documento' })).toHaveValue(
      source.content,
    );
    expect(api.getDriveSource).toHaveBeenCalledWith(source.id);
    expect(api.importDriveCopy).not.toHaveBeenCalled();
  });

  it('imports a Picker selection as a patient-bound managed copy from Documents', async () => {
    renderWorkspace('p1');

    await selectSection('Documentos');
    fireEvent.click(await screen.findByRole('button', { name: 'Importar copia desde Drive' }));

    await waitFor(() =>
      expect(api.importDriveCopy).toHaveBeenCalledWith({
        patient_id: 'p1',
        operation_id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ),
        source_file_id: source.id,
      }),
    );
    expect(openDrivePicker).toHaveBeenCalledTimes(1);
    expect(api.getDriveSource).not.toHaveBeenCalled();
  });

  it.each([
    { section: 'Notas' as const, patientId: null, action: 'Abrir desde Drive' },
    { section: 'Documentos' as const, patientId: 'p1', action: 'Importar copia desde Drive' },
  ])(
    'leaves $section unchanged when its Picker is cancelled',
    async ({ section, patientId, action }) => {
      vi.mocked(openDrivePicker).mockResolvedValueOnce(null);
      renderWorkspace(patientId);

      await selectSection(section);
      fireEvent.click(await screen.findByRole('button', { name: action }));

      await waitFor(() => expect(openDrivePicker).toHaveBeenCalledTimes(1));
      expect(api.getDriveSource).not.toHaveBeenCalled();
      expect(api.importDriveCopy).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );
});

describe('Drive-to-composer insertion', () => {
  async function openNote() {
    await selectSection('Notas');
    fireEvent.click(await screen.findByRole('button', { name: /Nota clínica\.md/ }));
    return screen.findByRole('textbox', { name: 'Contenido del documento' });
  }

  it('inserts the complete note with provenance and contextual feedback', async () => {
    const insert = vi.fn();
    renderWorkspace('p1', insert);

    await openNote();
    fireEvent.click(screen.getByRole('button', { name: 'Incorporar nota completa al borrador' }));

    expect(insert).toHaveBeenCalledWith(`Fuente: Google Drive · ${source.name}\n${source.content}`);
    expect(screen.getByRole('status', { name: 'Incorporado al borrador' })).toBeInTheDocument();
    expect(api.createDriveFile).not.toHaveBeenCalled();
    expect(api.updateDriveFile).not.toHaveBeenCalled();
    expect(api.importDriveCopy).not.toHaveBeenCalled();
  });

  it('inserts only the selected note text while keeping full insertion available', async () => {
    const insert = vi.fn();
    renderWorkspace('p1', insert);

    const editor = (await openNote()) as HTMLTextAreaElement;
    editor.setSelectionRange(0, 4);
    fireEvent.select(editor);
    fireEvent.click(screen.getByRole('button', { name: 'Incorporar al borrador' }));

    expect(insert).toHaveBeenCalledWith(`Fuente: Google Drive · ${source.name}\nNota`);
    expect(
      screen.getByRole('button', { name: 'Incorporar nota completa al borrador' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Incorporado al borrador' })).toBeInTheDocument();
  });

  it('requires a patient and leaves note state unchanged', async () => {
    const insert = vi.fn();
    renderWorkspace(null, insert);

    const editor = (await openNote()) as HTMLTextAreaElement;
    editor.setSelectionRange(0, 4);
    fireEvent.select(editor);

    const complete = screen.getByRole('button', { name: 'Incorporar nota completa al borrador' });
    const selection = screen.getByRole('button', { name: 'Incorporar al borrador' });
    expect(complete).toBeDisabled();
    expect(selection).toBeDisabled();
    expect(screen.getByText('Selecciona un paciente para insertar este contenido.')).toBeVisible();

    expect(editor).toHaveValue(source.content);
    expect(insert).not.toHaveBeenCalled();
  });

  it('preserves note state and reports failure when composer insertion fails', async () => {
    const insert = vi.fn(() => {
      throw new Error('composer unavailable');
    });
    renderWorkspace('p1', insert);

    const editor = await openNote();
    fireEvent.click(screen.getByRole('button', { name: 'Incorporar nota completa al borrador' }));

    expect(editor).toHaveValue(source.content);
    expect(screen.getByText('No se pudo añadir el contenido al borrador.')).toBeVisible();
    expect(
      screen.queryByRole('status', { name: 'Incorporado al borrador' }),
    ).not.toBeInTheDocument();
  });
});

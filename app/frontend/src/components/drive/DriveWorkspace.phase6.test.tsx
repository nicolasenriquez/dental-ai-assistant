/**
 * Fail-first contract tests for phase 6 Drive workspace behavior (task 6.1).
 *
 * Seam for task 6.2: `DriveWorkspace` gains two optional props on top of the
 * task 5.2 contract:
 *
 *   DriveWorkspace({ patientId, draftSeed?, onInsertToComposer?, onDirtyStateChange? })
 *
 * - `onInsertToComposer(text)` receives the complete current local buffer
 *   from `Insertar en el chat` (Preview and Edit) or the exact selected text
 *   from `Insertar selección en el chat` (Edit with a non-empty selection).
 *   Insertion never submits, saves, or calls any Drive/clinical API.
 * - `onDirtyStateChange(dirty)` reports the derived dirty state
 *   (`isDriveDocumentDirty`) so the shell can register the transition guard
 *   and the `beforeunload` handler.
 * - Operation IDs stay caller-stable per user action (one UUID per save or
 *   import) and are never reused across actions.
 * - `Importar una copia` opens the raw Picker for the active patient and
 *   imports the selected source through `importDriveCopy` with a fresh
 *   operation id, then refreshes the list and announces `Copia importada`.
 * - Every file/editor/Picker/transfer action requires the bound patient.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { type Mock, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';

type DriveWorkspaceComponent = (props: {
  patientId: string | null;
  draftSeed?: { name: string; content: string } | null;
  onInsertToComposer?: (text: string) => void;
  onDirtyStateChange?: (dirty: boolean) => void;
}) => ReactNode;

let DriveWorkspace: DriveWorkspaceComponent | null = null;

beforeAll(async () => {
  try {
    ({ DriveWorkspace } = await import('./DriveWorkspace'));
  } catch {
    DriveWorkspace = null;
  }
});

function Workspace(props: Parameters<DriveWorkspaceComponent>[0]) {
  if (!DriveWorkspace) {
    throw new Error('missing src/components/drive/DriveWorkspace.tsx seam — implement in task 6.2');
  }
  return DriveWorkspace(props);
}

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    getDriveStatus: vi.fn(),
    startDriveOAuth: vi.fn(),
    listDriveFiles: vi.fn(),
    searchDriveFiles: vi.fn(),
    getDriveFile: vi.fn(),
    createDriveFile: vi.fn(),
    updateDriveFile: vi.fn(),
    importDriveCopy: vi.fn(),
    recreateDriveWorkspace: vi.fn(),
    disconnectDrive: vi.fn(),
  };
});

vi.mock('../../lib/drivePicker', () => ({
  openDrivePicker: vi.fn(),
}));

const driveSeam = api as unknown as {
  getDriveStatus: unknown;
  listDriveFiles: unknown;
  getDriveFile: unknown;
  createDriveFile: unknown;
  updateDriveFile: unknown;
  importDriveCopy: unknown;
};

const getDriveStatusMock = driveSeam.getDriveStatus as Mock;
const listDriveFilesMock = driveSeam.listDriveFiles as Mock;
const getDriveFileMock = driveSeam.getDriveFile as Mock;
const createDriveFileMock = driveSeam.createDriveFile as Mock;
const updateDriveFileMock = driveSeam.updateDriveFile as Mock;
const importDriveCopyMock = driveSeam.importDriveCopy as Mock;

let openDrivePickerMock: Mock = vi.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const connectedStatus = {
  configured: true,
  status: 'connected',
  workspace: { folder_name: 'Dental AI Assistant' },
};

const fileBody = {
  id: 'f1',
  name: 'nota.txt',
  version: '10',
  mimeType: 'text/plain',
  modifiedTime: '2026-09-01T10:00:00Z',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeEach(async () => {
  vi.clearAllMocks();
  const picker = await import('../../lib/drivePicker');
  openDrivePickerMock = picker.openDrivePicker as unknown as Mock;
  getDriveStatusMock.mockResolvedValue(connectedStatus);
  listDriveFilesMock.mockResolvedValue({ files: [], next_page_token: null });
  getDriveFileMock.mockResolvedValue({ ...fileBody, content: 'texto remoto\n' });
  createDriveFileMock.mockResolvedValue({ ...fileBody, id: 'f2', name: 'borrador.txt' });
  updateDriveFileMock.mockResolvedValue({ ...fileBody, version: '11' });
  importDriveCopyMock.mockResolvedValue({ ...fileBody, id: 'f3', name: 'importado.txt' });
  openDrivePickerMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWorkspace(
  patientId: string | null = 'p1',
  extra?: Partial<Parameters<DriveWorkspaceComponent>[0]>,
) {
  return render(<Workspace patientId={patientId} {...extra} />);
}

async function openFirstFile(name = 'nota.txt') {
  const row = await screen.findByRole('button', { name });
  fireEvent.click(row);
}

describe('Drive-to-composer insertion', () => {
  it('inserts the complete local buffer from Preview without any write or submit', async () => {
    listDriveFilesMock.mockResolvedValue({ files: [fileBody], next_page_token: null });
    const onInsertToComposer = vi.fn();
    renderWorkspace('p1', { onInsertToComposer });

    await openFirstFile();
    await screen.findByText('texto remoto');
    fireEvent.click(screen.getByRole('button', { name: 'Usar en el chat' }));

    expect(onInsertToComposer).toHaveBeenCalledWith('texto remoto\n');
    expect(createDriveFileMock).not.toHaveBeenCalled();
    expect(updateDriveFileMock).not.toHaveBeenCalled();
    expect(importDriveCopyMock).not.toHaveBeenCalled();
  });

  it('inserts the complete local buffer from Edit including unsaved changes', async () => {
    listDriveFilesMock.mockResolvedValue({ files: [fileBody], next_page_token: null });
    const onInsertToComposer = vi.fn();
    renderWorkspace('p1', { onInsertToComposer });

    await openFirstFile();
    await screen.findByText('texto remoto');
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const editor = screen.getByRole('textbox', { name: 'Contenido del documento' });
    fireEvent.change(editor, { target: { value: 'texto editado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Usar en el chat' }));

    expect(onInsertToComposer).toHaveBeenCalledWith('texto editado');
    expect(updateDriveFileMock).not.toHaveBeenCalled();
  });

  it('inserts only the selected text while full-document insertion stays available', async () => {
    const onInsertToComposer = vi.fn();
    render(
      <Workspace
        patientId="p1"
        draftSeed={{ name: 'borrador', content: 'texto completo' }}
        onInsertToComposer={onInsertToComposer}
      />,
    );

    const editor = await screen.findByRole('textbox', { name: 'Contenido del documento' });
    (editor as HTMLTextAreaElement).setSelectionRange(6, 14);
    fireEvent.select(editor);
    fireEvent.click(screen.getByRole('button', { name: 'Insertar selección en el chat' }));

    expect(onInsertToComposer).toHaveBeenCalledWith('completo');
    expect(screen.getByRole('button', { name: 'Usar en el chat' })).toBeInTheDocument();
  });

  it('hides selection insertion when the editor has no selection', async () => {
    render(<Workspace patientId="p1" draftSeed={{ name: 'borrador', content: 'texto' }} />);

    await screen.findByRole('textbox', { name: 'Contenido del documento' });
    expect(
      screen.queryByRole('button', { name: 'Insertar selección en el chat' }),
    ).not.toBeInTheDocument();
  });

  it('disables every transfer action without an active patient', async () => {
    render(
      <Workspace
        patientId={null}
        draftSeed={{ name: 'borrador', content: 'texto' }}
        onInsertToComposer={vi.fn()}
      />,
    );

    const insert = await screen.findByRole('button', { name: 'Usar en el chat' });
    expect(insert).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Agregar desde Drive' })).not.toBeInTheDocument();
  });
});

describe('stable operation ids', () => {
  it('uses one fresh UUID per save action and never reuses it', async () => {
    const firstGate = deferred<typeof fileBody>();
    createDriveFileMock.mockReturnValue(firstGate.promise);
    const view = render(<Workspace patientId="p1" draftSeed={{ name: 'b1', content: 'uno\n' }} />);

    await screen.findByRole('textbox', { name: 'Contenido del documento' });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByRole('status', { name: 'Guardando…' });
    act(() => {
      firstGate.resolve({ ...fileBody, id: 'f2' });
    });
    await screen.findByText('Guardado');

    view.rerender(<Workspace patientId="p1" draftSeed={{ name: 'b2', content: 'dos\n' }} />);
    await screen.findByRole('textbox', { name: 'Contenido del documento' });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(createDriveFileMock).toHaveBeenCalledTimes(2));

    const first = createDriveFileMock.mock.calls[0][0].operation_id as string;
    const second = createDriveFileMock.mock.calls[1][0].operation_id as string;
    expect(first).toMatch(UUID_PATTERN);
    expect(second).toMatch(UUID_PATTERN);
    expect(first).not.toBe(second);
  });

  it('uses a fresh operation id for each import action', async () => {
    openDrivePickerMock.mockResolvedValue('source-1');
    renderWorkspace('p1');

    await screen.findByRole('button', { name: 'Agregar desde Drive' });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar desde Drive' }));
    await waitFor(() => expect(importDriveCopyMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Agregar desde Drive' }));
    await waitFor(() => expect(importDriveCopyMock).toHaveBeenCalledTimes(2));

    const first = importDriveCopyMock.mock.calls[0][0].operation_id as string;
    const second = importDriveCopyMock.mock.calls[1][0].operation_id as string;
    expect(first).toMatch(UUID_PATTERN);
    expect(second).toMatch(UUID_PATTERN);
    expect(first).not.toBe(second);
  });
});

describe('Picker import copy', () => {
  it('imports the selected source for the bound patient and refreshes the list', async () => {
    listDriveFilesMock.mockResolvedValue({ files: [], next_page_token: null });
    openDrivePickerMock.mockResolvedValue('source-file-1');
    importDriveCopyMock.mockResolvedValue({ ...fileBody, id: 'f3', name: 'importado.txt' });
    renderWorkspace('p1');

    await screen.findByRole('button', { name: 'Agregar desde Drive' });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar desde Drive' }));

    await waitFor(() =>
      expect(importDriveCopyMock).toHaveBeenCalledWith({
        patient_id: 'p1',
        operation_id: expect.stringMatching(UUID_PATTERN),
        source_file_id: 'source-file-1',
      }),
    );
    expect(await screen.findByText('Documento agregado')).toBeInTheDocument();
    expect(listDriveFilesMock).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the Picker is cancelled', async () => {
    openDrivePickerMock.mockResolvedValue(null);
    renderWorkspace('p1');

    await screen.findByRole('button', { name: 'Agregar desde Drive' });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar desde Drive' }));

    await waitFor(() => expect(openDrivePickerMock).toHaveBeenCalledWith('p1'));
    expect(importDriveCopyMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Documento agregado')).not.toBeInTheDocument();
  });

  it('preserves the workspace on import failure without automatic retry', async () => {
    openDrivePickerMock.mockResolvedValue('source-file-1');
    importDriveCopyMock.mockRejectedValue(new api.ApiError(503, { error: 'DRIVE_UNAVAILABLE' }));
    renderWorkspace('p1');

    await screen.findByRole('button', { name: 'Agregar desde Drive' });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar desde Drive' }));

    await waitFor(() => expect(importDriveCopyMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('No se pudo completar la acción')).toBeInTheDocument();
  });

  it('keeps the Picker bound to the patient that was active when it opened', async () => {
    openDrivePickerMock.mockResolvedValue(null);
    const { rerender } = renderWorkspace('p1');

    await screen.findByRole('button', { name: 'Agregar desde Drive' });
    rerender(<Workspace patientId="p2" />);
    await screen.findByRole('button', { name: 'Agregar desde Drive' });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar desde Drive' }));

    await waitFor(() => expect(openDrivePickerMock).toHaveBeenCalledWith('p2'));
  });
});

describe('dirty state reporting', () => {
  it('reports the derived dirty state to the shell', async () => {
    listDriveFilesMock.mockResolvedValue({ files: [fileBody], next_page_token: null });
    const onDirtyStateChange = vi.fn();
    renderWorkspace('p1', { onDirtyStateChange });

    await openFirstFile();
    await screen.findByText('texto remoto');
    expect(onDirtyStateChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const editor = screen.getByRole('textbox', { name: 'Contenido del documento' });
    fireEvent.change(editor, { target: { value: 'texto cambiado' } });
    expect(onDirtyStateChange).toHaveBeenLastCalledWith(true);

    fireEvent.change(editor, { target: { value: 'texto remoto\n' } });
    expect(onDirtyStateChange).toHaveBeenLastCalledWith(false);
  });

  it('reports a seeded draft as dirty from the start', async () => {
    const onDirtyStateChange = vi.fn();
    render(
      <Workspace
        patientId="p1"
        draftSeed={{ name: 'borrador', content: 'texto' }}
        onDirtyStateChange={onDirtyStateChange}
      />,
    );

    await screen.findByRole('textbox', { name: 'Contenido del documento' });
    expect(onDirtyStateChange).toHaveBeenLastCalledWith(true);
  });
});

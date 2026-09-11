/**
 * Fail-first contract tests for the Drive workspace UI (task 5.1).
 *
 * Seam for task 5.2: `src/components/drive/DriveWorkspace.tsx` —
 *
 *   DriveWorkspace({ patientId, draftSeed? })
 *
 * where `patientId: string | null` (null = no active patient) and
 * `draftSeed?: { name: string; content: string } | null` seeds a local
 * Markdown draft (task 6.x passes Assistant content through it).
 *
 * Component contract:
 * - Fetches `/api/google-drive/status` on mount; only a `connected` status
 *   plus an active patient loads the file list (`listDriveFiles`).
 * - One discriminated workspace state; connection presentation follows the
 *   exact Spanish copy in `design.md` decision 25.
 * - Existing files open `ready -> opening -> viewing` with read-only
 *   application-native TXT preview; drafts open in `editing`. Preview and
 *   Edit share one local buffer; switching between them performs no Google
 *   request, save, submission, or LLM call.
 * - Save is manual: `Guardando…` while in flight, `Guardado` on success,
 *   conflict/unknown preserves the local buffer with no automatic retry.
 * - Editor content is labelled `Contenido del documento`; draft name input
 *   is labelled `Nombre del documento` and visibly normalizes to `.txt`.
 * - Document list paginates through the opaque `next_page_token`.
 * - Accessibility: Preview/Edit are two native buttons with `aria-pressed`
 *   (no tabs), and below 768px the open document renders inside an
 *   accessible labelled dialog (Sheet) that closes on Escape.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { type Mock, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';

type DriveWorkspaceComponent = (props: {
  patientId: string | null;
  draftSeed?: { name: string; content: string } | null;
}) => ReactNode;

let DriveWorkspace: DriveWorkspaceComponent | null = null;

beforeAll(async () => {
  try {
    ({ DriveWorkspace } = await import('./DriveWorkspace'));
  } catch {
    DriveWorkspace = null;
  }
});

function Workspace(props: {
  patientId: string | null;
  draftSeed?: { name: string; content: string } | null;
}) {
  if (!DriveWorkspace) {
    throw new Error('missing src/components/drive/DriveWorkspace.tsx seam — implement in task 5.2');
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

const driveSeam = api as unknown as {
  getDriveStatus: unknown;
  startDriveOAuth: unknown;
  listDriveFiles: unknown;
  searchDriveFiles: unknown;
  getDriveFile: unknown;
  createDriveFile: unknown;
  updateDriveFile: unknown;
  recreateDriveWorkspace: unknown;
};

const getDriveStatusMock = driveSeam.getDriveStatus as Mock;
const startDriveOAuthMock = driveSeam.startDriveOAuth as Mock;
const listDriveFilesMock = driveSeam.listDriveFiles as Mock;
const searchDriveFilesMock = driveSeam.searchDriveFiles as Mock;
const getDriveFileMock = driveSeam.getDriveFile as Mock;
const createDriveFileMock = driveSeam.createDriveFile as Mock;
const updateDriveFileMock = driveSeam.updateDriveFile as Mock;
const recreateDriveWorkspaceMock = driveSeam.recreateDriveWorkspace as Mock;

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

beforeEach(() => {
  vi.clearAllMocks();
  getDriveStatusMock.mockResolvedValue(connectedStatus);
  startDriveOAuthMock.mockResolvedValue({
    authorization_url: 'https://accounts.google.com/o/oauth2/auth?x=1',
  });
  listDriveFilesMock.mockResolvedValue({ files: [], next_page_token: null });
  searchDriveFilesMock.mockResolvedValue({ files: [], next_page_token: null });
  getDriveFileMock.mockResolvedValue({ ...fileBody, content: '**negrita**\n' });
  createDriveFileMock.mockResolvedValue({ ...fileBody, id: 'f2', name: 'borrador.txt' });
  updateDriveFileMock.mockResolvedValue({ ...fileBody, version: '11' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWorkspace(patientId: string | null = 'p1') {
  return render(<Workspace patientId={patientId} />);
}

function stubMobile() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

async function openFirstFile(name = 'nota.txt') {
  const row = await screen.findByRole('button', { name });
  fireEvent.click(row);
}

describe('connection presentation', () => {
  it('is passive when Drive is unconfigured, without a fake CTA', async () => {
    getDriveStatusMock.mockResolvedValue({ configured: false, status: 'unconfigured' });
    renderWorkspace();

    expect(await screen.findByText('Google Drive no está disponible')).toBeInTheDocument();
    expect(
      screen.getByText('La integración no está configurada en este entorno.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Conectar Google Drive' })).not.toBeInTheDocument();
  });

  it('shows disconnected onboarding with exactly one dominant action', async () => {
    getDriveStatusMock.mockResolvedValue({ configured: true, status: 'disconnected' });
    renderWorkspace();

    expect(await screen.findByText('Conecta Google Drive')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Trabaja con documentos asociados al paciente sin salir del Asistente Clínico.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Conectar Google Drive' })).toHaveLength(1);
    expect(
      screen.getByText(
        'Dental AI Assistant sólo administrará los archivos que cree o importes explícitamente.',
      ),
    ).toBeInTheDocument();
  });

  it('replaces the primary with an immediate Spinner state while connecting', async () => {
    getDriveStatusMock.mockResolvedValue({ configured: true, status: 'disconnected' });
    const gate = deferred<{ authorization_url: string }>();
    startDriveOAuthMock.mockReturnValue(gate.promise);
    renderWorkspace();

    const connect = await screen.findByRole('button', { name: 'Conectar Google Drive' });
    fireEvent.click(connect);

    const connecting = screen.getByRole('button', { name: 'Conectando…' });
    expect(connecting).toBeDisabled();
    expect(startDriveOAuthMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('shows the compact connected header without account identity', async () => {
    renderWorkspace();

    expect(await screen.findByText('Google Drive')).toBeInTheDocument();
    expect(screen.getByText('Conectado')).toBeInTheDocument();
    expect(screen.getByText('Dental AI Assistant')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Buscar documentos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar una copia' })).toBeInTheDocument();
  });

  it('shows the exact revoked Alert and preserves the Dental session', async () => {
    getDriveStatusMock.mockResolvedValue({ configured: true, status: 'revoked' });
    renderWorkspace();

    expect(await screen.findByText('Vuelve a conectar Google Drive')).toBeInTheDocument();
    expect(
      screen.getByText(
        'El acceso al workspace dejó de estar disponible. Tu sesión de Dental AI Assistant continúa activa.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reconectar' })).toBeInTheDocument();
  });

  it('shows the missing-workspace Alert and a consequence-only recreation dialog', async () => {
    getDriveStatusMock.mockResolvedValue({ configured: true, status: 'workspace_missing' });
    renderWorkspace();

    expect(await screen.findByText('Workspace no disponible')).toBeInTheDocument();
    expect(
      screen.getByText('La carpeta administrada anteriormente no se puede verificar.'),
    ).toBeInTheDocument();
    expect(recreateDriveWorkspaceMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Ver opciones' }));

    expect(screen.getByRole('dialog', { name: 'Recrear workspace' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Se creará una nueva carpeta Dental AI Assistant. Los archivos de la carpeta anterior no se eliminarán.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Recrear workspace' }));
    await waitFor(() =>
      expect(recreateDriveWorkspaceMock).toHaveBeenCalledWith(expect.any(String), true),
    );
  });

  it('shows the recovery-pending Alert with the orphan acknowledgement copy', async () => {
    getDriveStatusMock.mockResolvedValue({
      configured: true,
      status: 'workspace_recovery_pending',
    });
    renderWorkspace();

    expect(await screen.findByText('Revisión del workspace pendiente')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Google Drive podría haber creado una carpeta que Dental AI Assistant todavía no puede verificar. Revisa las opciones antes de crear otra.',
      ),
    ).toBeInTheDocument();
    expect(listDriveFilesMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Ver opciones' }));
    expect(
      screen.getByText(
        'Podría existir una carpeta anterior no administrada. Si aparece después, deberás eliminarla manualmente desde Google Drive.',
      ),
    ).toBeInTheDocument();
  });

  it('shows connection status but no patient actions without an active patient', async () => {
    renderWorkspace(null);

    expect(await screen.findByText('Conectado')).toBeInTheDocument();
    expect(listDriveFilesMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('searchbox', { name: 'Buscar documentos' })).not.toBeInTheDocument();
  });
});

describe('patient-scoped list', () => {
  it('shows honest loading and empty copy', async () => {
    const gate = deferred<{ files: unknown[]; next_page_token: string | null }>();
    listDriveFilesMock.mockReturnValue(gate.promise);
    renderWorkspace();

    expect(await screen.findByText('Cargando documentos…')).toBeInTheDocument();
    act(() => {
      gate.resolve({ files: [], next_page_token: null });
    });

    expect(await screen.findByText('No hay documentos para este paciente.')).toBeInTheDocument();
    expect(listDriveFilesMock).toHaveBeenCalledWith('p1', undefined);
  });

  it('pages through the opaque next_page_token', async () => {
    listDriveFilesMock
      .mockResolvedValueOnce({ files: [fileBody], next_page_token: 'tok1' })
      .mockResolvedValueOnce({
        files: [{ ...fileBody, id: 'f2', name: 'segunda.txt' }],
        next_page_token: null,
      });
    renderWorkspace();

    expect(await screen.findByRole('button', { name: 'nota.txt' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

    expect(await screen.findByRole('button', { name: 'segunda.txt' })).toBeInTheDocument();
    expect(listDriveFilesMock).toHaveBeenLastCalledWith('p1', 'tok1');
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('reloads the list when the active patient changes', async () => {
    listDriveFilesMock.mockResolvedValue({ files: [fileBody], next_page_token: null });
    const { rerender } = renderWorkspace('p1');

    await screen.findByRole('button', { name: 'nota.txt' });
    rerender(<Workspace patientId="p2" />);

    await waitFor(() => expect(listDriveFilesMock).toHaveBeenLastCalledWith('p2', undefined));
  });

  it('searches through the body-scoped endpoint, never the URL', async () => {
    renderWorkspace();

    const searchbox = await screen.findByRole('searchbox', { name: 'Buscar documentos' });
    fireEvent.change(searchbox, { target: { value: 'dolor' } });
    fireEvent.keyDown(searchbox, { key: 'Enter' });

    await waitFor(() =>
      expect(searchDriveFilesMock).toHaveBeenCalledWith({
        patient_id: 'p1',
        query: 'dolor',
        page_token: undefined,
      }),
    );
    expect(searchDriveFilesMock.mock.calls[0][0]).not.toHaveProperty('page_token');
  });
});

describe('document preview and edit', () => {
  it('opens existing files in Preview first with the honest opening state', async () => {
    const gate = deferred<typeof fileBody & { content: string }>();
    getDriveFileMock.mockReturnValue(gate.promise);
    listDriveFilesMock.mockResolvedValue({ files: [fileBody], next_page_token: null });
    renderWorkspace();

    await openFirstFile();
    expect(await screen.findByText('Abriendo…')).toBeInTheDocument();

    act(() => {
      gate.resolve({ ...fileBody, content: 'texto remoto\n' });
    });

    expect(await screen.findByText('texto remoto')).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Contenido del documento' }),
    ).not.toBeInTheDocument();
    expect(getDriveFileMock).toHaveBeenCalledWith('f1', 'p1');
  });

  it('renders remote TXT literally without Markdown reconstruction', async () => {
    listDriveFilesMock.mockResolvedValue({ files: [fileBody], next_page_token: null });
    const { container } = renderWorkspace();
    await openFirstFile();
    await screen.findByText('**negrita**');

    expect(container.querySelector('strong')).not.toBeInTheDocument();
  });

  it('opens a seeded draft in Edit with a normalized name and no write', async () => {
    render(
      <Workspace patientId="p1" draftSeed={{ name: 'borrador.md', content: '**fuerte**\n' }} />,
    );

    const editor = await screen.findByRole('textbox', { name: 'Contenido del documento' });
    expect(editor).toHaveValue('**fuerte**\n');
    expect(screen.getByLabelText('Nombre del documento')).toHaveValue('borrador.txt');
    expect(createDriveFileMock).not.toHaveBeenCalled();
    expect(updateDriveFileMock).not.toHaveBeenCalled();
  });

  it('shares one buffer between Preview and Edit with no network effects', async () => {
    const { container } = render(
      <Workspace patientId="p1" draftSeed={{ name: 'borrador', content: '**fuerte**\n' }} />,
    );

    const editor = await screen.findByRole('textbox', { name: 'Contenido del documento' });
    fireEvent.change(editor, { target: { value: '**fuerte**\nmás texto' } });

    fireEvent.click(screen.getByRole('button', { name: 'Vista previa' }));
    expect(await screen.findByText('más texto')).toBeInTheDocument();
    expect(container.querySelector('strong')).toHaveTextContent('fuerte');

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByRole('textbox', { name: 'Contenido del documento' })).toHaveValue(
      '**fuerte**\nmás texto',
    );

    expect(getDriveFileMock).not.toHaveBeenCalled();
    expect(listDriveFilesMock).toHaveBeenCalledTimes(1);
    expect(createDriveFileMock).not.toHaveBeenCalled();
    expect(updateDriveFileMock).not.toHaveBeenCalled();
  });

  it('previews local Markdown without raw HTML execution', async () => {
    const { container } = render(
      <Workspace
        patientId="p1"
        draftSeed={{ name: 'segura', content: '**fuerte** <script>alert(1)</script>' }}
      />,
    );

    await screen.findByRole('textbox', { name: 'Contenido del documento' });
    fireEvent.click(screen.getByRole('button', { name: 'Vista previa' }));

    await screen.findByText('fuerte');
    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
  });

  it('normalizes a new draft name to .txt visibly', async () => {
    render(<Workspace patientId="p1" draftSeed={{ name: 'Nota', content: 'x' }} />);

    const nameInput = await screen.findByLabelText('Nombre del documento');
    expect(nameInput).toHaveValue('Nota.txt');

    fireEvent.change(nameInput, { target: { value: 'otro.md' } });
    expect(nameInput).toHaveValue('otro.txt');
  });

  it('saves manually with immediate feedback and the serialized export', async () => {
    const gate = deferred<typeof fileBody>();
    createDriveFileMock.mockReturnValue(gate.promise);
    render(
      <Workspace patientId="p1" draftSeed={{ name: 'borrador.md', content: 'Línea uno\n' }} />,
    );

    const editor = await screen.findByRole('textbox', { name: 'Contenido del documento' });
    fireEvent.change(editor, { target: { value: 'Línea uno\nLínea dos' } });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Guardando…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    expect(updateDriveFileMock).not.toHaveBeenCalled();

    act(() => {
      gate.resolve({ ...fileBody, id: 'f2', version: '2' });
    });

    expect(await screen.findByText('Guardado')).toBeInTheDocument();
    expect(createDriveFileMock).toHaveBeenCalledTimes(1);
    expect(createDriveFileMock).toHaveBeenCalledWith({
      patient_id: 'p1',
      operation_id: expect.any(String),
      name: 'borrador.txt',
      content: 'Línea uno\nLínea dos\n',
    });
  });

  it('never writes while editing without explicit save', async () => {
    render(<Workspace patientId="p1" draftSeed={{ name: 'borrador', content: 'texto' }} />);

    const editor = await screen.findByRole('textbox', { name: 'Contenido del documento' });
    fireEvent.change(editor, { target: { value: 'texto cambiado' } });
    fireEvent.blur(editor);

    expect(createDriveFileMock).not.toHaveBeenCalled();
    expect(updateDriveFileMock).not.toHaveBeenCalled();
  });

  it('preserves local content on conflict with Cancel or View current version only', async () => {
    listDriveFilesMock.mockResolvedValue({ files: [fileBody], next_page_token: null });
    updateDriveFileMock.mockRejectedValue(new api.ApiError(409, { error: 'DRIVE_FILE_CHANGED' }));
    renderWorkspace();

    await openFirstFile();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const editor = screen.getByRole('textbox', { name: 'Contenido del documento' });
    fireEvent.change(editor, { target: { value: 'cambio local' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver versión actual' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sobrescribir/i })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Contenido del documento' })).toHaveValue(
      'cambio local',
    );
    expect(updateDriveFileMock).toHaveBeenCalledTimes(1);
  });

  it('preserves local content on unknown writes without automatic retry', async () => {
    listDriveFilesMock.mockResolvedValue({ files: [fileBody], next_page_token: null });
    updateDriveFileMock.mockRejectedValue(new api.ApiError(503, { error: 'DRIVE_WRITE_UNKNOWN' }));
    renderWorkspace();

    await openFirstFile();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const editor = screen.getByRole('textbox', { name: 'Contenido del documento' });
    fireEvent.change(editor, { target: { value: 'contenido local' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('No se pudo completar la acción')).toBeInTheDocument();
    expect(screen.getByText('Tu trabajo local se conserva.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Contenido del documento' })).toHaveValue(
      'contenido local',
    );
    expect(updateDriveFileMock).toHaveBeenCalledTimes(1);
  });

  it('returns to the list from an open document', async () => {
    listDriveFilesMock.mockResolvedValue({ files: [fileBody], next_page_token: null });
    renderWorkspace();

    await openFirstFile();
    await screen.findByText('**negrita**');
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));

    expect(await screen.findByRole('button', { name: 'nota.txt' })).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Contenido del documento' }),
    ).not.toBeInTheDocument();
  });
});

describe('accessibility', () => {
  it('uses two native buttons with aria-pressed for the Preview/Edit control', async () => {
    render(<Workspace patientId="p1" draftSeed={{ name: 'borrador', content: 'texto' }} />);

    await screen.findByRole('textbox', { name: 'Contenido del documento' });
    const edit = screen.getByRole('button', { name: 'Editar' });
    const preview = screen.getByRole('button', { name: 'Vista previa' });

    expect(edit).toHaveAttribute('aria-pressed', 'true');
    expect(preview).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();

    fireEvent.click(preview);
    expect(screen.getByRole('button', { name: 'Vista previa' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the document in a labelled accessible dialog on mobile that closes with Escape', async () => {
    stubMobile();
    listDriveFilesMock.mockResolvedValue({ files: [fileBody], next_page_token: null });
    renderWorkspace();

    await openFirstFile();
    const dialog = await screen.findByRole('dialog', { name: 'Documento' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('**negrita**')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Documento' })).toBeNull());
  });
});

/**
 * Fail-first contract tests for clinical-to-Drive transfer wiring (task 6.1).
 *
 * Seam for task 6.2 (design decisions 27, 28, 29): the Clinical Assistant
 * page mounts the Drive workspace accessory, passes the active patient,
 * exposes `Guardar en Drive` on completed assistant messages and structured
 * draft artifacts, bridges explicit Drive-to-composer insertion, and owns
 * the dirty-transition guard plus the `beforeunload` handler.
 *
 * Contract:
 * - `Guardar en Drive` opens an editable local Markdown draft with the
 *   message text or the serialized draft (visible labels only, empty
 *   sections and review flags omitted) and performs no Drive API write.
 * - `Insertar en el chat` appends the complete local buffer to the current
 *   composer draft with newline separation, focuses the composer, and never
 *   submits, queues, or starts an SSE/LLM request.
 * - Transfer actions are disabled without a matching active patient.
 * - While the Drive editor is dirty, changing the active patient is
 *   suspended and a dialog offers `Guardar cambios`, `Descartar cambios`,
 *   and `Cancelar`; only Discard continues the change.
 * - While dirty, the page registers a `beforeunload` handler that requests
 *   browser-native confirmation; it is removed once the document is clean.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { ClinicalAssistant } from './ClinicalAssistant';

const mocks = vi.hoisted(() => {
  type PatientShape = {
    id: string;
    first_name: string;
    last_name: string;
    rut_masked: string;
    birth_date: string | null;
  };
  return {
    setActivePatient: vi.fn(),
    send: vi.fn(async () => true),
    thread: {
      id: 't1',
      owner_user_id: 'u1',
      title: 'Asistente clínico',
      active_patient: {
        id: 'p1',
        first_name: 'Ana',
        last_name: 'Pérez',
        rut_masked: '12.345.•••-6',
        birth_date: null,
      } as PatientShape | null,
      pending_action_patient: null,
      active_turn_id: null,
      created_at: '2026-09-10T12:00:00Z',
      updated_at: '2026-09-10T12:00:00Z',
      messages: [
        {
          id: 'm1',
          thread_id: 't1',
          turn_id: 'turn-1',
          role: 'assistant',
          content: 'Mensaje del asistente',
          created_at: '2026-09-10T12:00:00Z',
        },
      ],
      artifacts: [],
      pending_action: null,
    },
    items: [
      {
        id: 'm1',
        turnId: 'turn-1',
        status: 'completed',
        createdAt: '2026-09-10T12:00:00Z',
        type: 'assistant',
        content: 'Mensaje del asistente',
      },
      {
        id: 'd1',
        turnId: 'turn-1',
        status: 'completed',
        createdAt: '2026-09-10T12:00:01Z',
        type: 'draft',
        artifactStatus: 'completed',
        draft: {
          context: 'Motivo odontológico',
          findings: '',
          assessment: '',
          treatment: '',
          follow_up: 'Control en 6 meses',
          review_flags: [{ source_text: 'fragmento', reason: 'bandera interna de revisión' }],
        },
        baseline: {
          context: 'Motivo odontológico',
          findings: '',
          assessment: '',
          treatment: '',
          follow_up: 'Control en 6 meses',
          review_flags: [{ source_text: 'fragmento', reason: 'bandera interna de revisión' }],
        },
        sourceNote: '',
        edited: false,
        stale: false,
        patientId: 'p1',
        evolutionAt: '2026-09-10T10:00:00Z',
      },
    ],
  };
});

vi.mock('../hooks/useClinicalAssistant', () => ({
  useClinicalAssistant: () => ({
    thread: mocks.thread,
    items: mocks.items,
    runtime: 'idle',
    error: null,
    send: mocks.send,
    stop: vi.fn(),
    setActivePatient: mocks.setActivePatient,
    updateDraft: vi.fn(),
    updateDraftSource: vi.fn(async () => true),
    updateDraftDate: vi.fn(),
    regenerateDraft: vi.fn(),
    prepareDraft: vi.fn(async () => null),
    resolve: vi.fn(async () => {}),
    backToEdit: vi.fn(async () => true),
    patientSwitch: null,
    cancelPatientSwitch: vi.fn(),
    confirmPatientSwitch: vi.fn(),
    reload: vi.fn(),
    retryTurn: vi.fn(),
    artifactSyncState: {},
    retryArtifactSync: vi.fn(),
  }),
}));

vi.mock('../hooks/useVoiceDictation', () => ({
  useVoiceDictation: () => ({
    state: 'idle',
    elapsed: 0,
    error: null,
    canRetry: false,
    stream: null,
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
    retry: vi.fn(),
  }),
  isVoiceInFlight: () => false,
}));

vi.mock('../components/DriveBootstrapBanner', () => ({
  DriveBootstrapBanner: () => null,
}));

vi.mock('../components/Sidebar', () => ({
  Sidebar: () => null,
}));

vi.mock('../lib/drivePicker', () => ({
  openDrivePicker: vi.fn(async () => null),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    acquireClinicalThread: vi.fn(),
    getPatients: vi.fn(),
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
    getDrivePickerToken: vi.fn(),
  };
});

const apiSeam = api as unknown as {
  getPatients: ReturnType<typeof vi.fn>;
  getDriveStatus: ReturnType<typeof vi.fn>;
  listDriveFiles: ReturnType<typeof vi.fn>;
  createDriveFile: ReturnType<typeof vi.fn>;
  updateDriveFile: ReturnType<typeof vi.fn>;
};

const connectedStatus = {
  configured: true,
  status: 'connected',
  workspace: { folder_name: 'Dental AI Assistant' },
};

beforeAll(() => {
  HTMLElement.prototype.scrollTo = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.thread.active_patient = {
    id: 'p1',
    first_name: 'Ana',
    last_name: 'Pérez',
    rut_masked: '12.345.•••-6',
    birth_date: null,
  };
  apiSeam.getPatients.mockResolvedValue([
    {
      id: 'p1',
      first_name: 'Ana',
      last_name: 'Pérez',
      rut_masked: '12.345.•••-6',
      birth_date: null,
      last_evolution_at: null,
    },
    {
      id: 'p2',
      first_name: 'Bruno',
      last_name: 'Gómez',
      rut_masked: '9.876.•••-1',
      birth_date: null,
      last_evolution_at: null,
    },
  ]);
  apiSeam.getDriveStatus.mockResolvedValue(connectedStatus);
  apiSeam.listDriveFiles.mockResolvedValue({ files: [], next_page_token: null });
  apiSeam.createDriveFile.mockResolvedValue({
    id: 'f2',
    name: 'borrador.txt',
    version: '1',
    mimeType: 'text/plain',
    modifiedTime: '2026-09-10T12:00:00Z',
  });
  apiSeam.updateDriveFile.mockResolvedValue({
    id: 'f1',
    name: 'nota.txt',
    version: '11',
    mimeType: 'text/plain',
    modifiedTime: '2026-09-10T12:00:00Z',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAssistant() {
  return render(
    <MemoryRouter initialEntries={['/a/t1']}>
      <Routes>
        <Route path="/a/:threadId" element={<ClinicalAssistant />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openAssistantMessageDraft() {
  const assistantMessage = screen.getByRole('article', { name: 'Asistente' });
  fireEvent.click(within(assistantMessage).getByRole('button', { name: 'Guardar en Drive' }));
  return screen.findByRole('textbox', { name: 'Contenido del documento' });
}

function composer() {
  return screen.getByRole('textbox', { name: 'Nota clínica' });
}

function choosePatient(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Seleccionar paciente activo' }));
  fireEvent.click(screen.getByRole('option', { name: new RegExp(name) }));
}

function dispatchBeforeUnload(): Event {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe('Clinical Assistant Drive transfer', () => {
  it('passes the active patient to the Drive workspace and loads its files', async () => {
    renderAssistant();

    expect(await screen.findByText('Conectado')).toBeInTheDocument();
    await waitFor(() => expect(apiSeam.listDriveFiles).toHaveBeenCalledWith('p1', undefined));
  });

  it('opens a local Markdown draft from an assistant message without any write', async () => {
    renderAssistant();

    const editor = await openAssistantMessageDraft();

    expect(editor).toHaveValue('Mensaje del asistente');
    expect(apiSeam.createDriveFile).not.toHaveBeenCalled();
    expect(apiSeam.updateDriveFile).not.toHaveBeenCalled();
  });

  it('serializes a structured draft with visible labels only, no empty sections or review flags', async () => {
    renderAssistant();

    const draftButton = screen
      .getAllByRole('button', { name: 'Guardar en Drive' })
      .find((button) => button.closest('article') === null);
    expect(draftButton).toBeDefined();
    fireEvent.click(draftButton as HTMLElement);

    const editor = await screen.findByRole('textbox', { name: 'Contenido del documento' });
    expect(editor).toHaveValue(
      'Motivo / contexto: Motivo odontológico\n\nSeguimiento: Control en 6 meses',
    );
    expect(editor).not.toHaveValue(expect.stringContaining('Hallazgos'));
    expect(editor).not.toHaveValue(expect.stringContaining('bandera interna'));
    expect(apiSeam.createDriveFile).not.toHaveBeenCalled();
  });

  it('inserts the complete document into the composer without submitting', async () => {
    renderAssistant();

    await openAssistantMessageDraft();
    fireEvent.change(composer(), { target: { value: 'nota previa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Usar en el chat' }));

    expect(composer()).toHaveValue('nota previa\nMensaje del asistente');
    expect(composer()).toHaveFocus();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(apiSeam.createDriveFile).not.toHaveBeenCalled();
  });

  it('disables every transfer action without an active patient', async () => {
    mocks.thread.active_patient = null;
    renderAssistant();

    await screen.findByText('Conectado');
    const transferButtons = screen.queryAllByRole('button', { name: 'Guardar en Drive' });
    expect(transferButtons.length).toBeGreaterThan(0);
    for (const button of transferButtons) {
      expect(button).toBeDisabled();
    }
    expect(apiSeam.listDriveFiles).not.toHaveBeenCalled();
  });

  it('suspends patient change while dirty with Guardar/Descartar/Cancelar', async () => {
    renderAssistant();

    const editor = await openAssistantMessageDraft();
    fireEvent.change(editor, { target: { value: 'cambio local' } });
    choosePatient('Bruno');

    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descartar cambios' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(mocks.setActivePatient).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(mocks.setActivePatient).toHaveBeenCalledWith('p2');
  });

  it('keeps editor content and patient unchanged when the change is cancelled', async () => {
    renderAssistant();

    const editor = await openAssistantMessageDraft();
    fireEvent.change(editor, { target: { value: 'cambio local' } });
    choosePatient('Bruno');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(mocks.setActivePatient).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Contenido del documento' })).toHaveValue(
      'cambio local',
    );
  });

  it('requests browser-native unload confirmation only while the editor is dirty', async () => {
    renderAssistant();

    const editor = await openAssistantMessageDraft();
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(apiSeam.createDriveFile).toHaveBeenCalledTimes(1));
    await screen.findByText('Guardado');

    expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
  });
});

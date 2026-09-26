/**
 * Fail-first contract tests for clinical-to-Drive transfer wiring (task 6.1).
 *
 * Seam for task 6.2 (design decisions 27, 28, 29): the Clinical Assistant
 * page mounts the Drive workspace accessory, passes the active patient,
 * exposes `Guardar copia en Drive` on completed assistant messages and structured
 * draft artifacts, bridges explicit Drive-to-composer insertion, and owns
 * the dirty-transition guard plus the `beforeunload` handler.
 *
 * Contract:
 * - `Guardar copia en Drive` opens an editable local Markdown draft with the
 *   message text or the serialized draft (visible labels only, empty
 *   sections and review flags omitted) and performs no Drive API write.
 * - `Insertar nota completa` and `Insertar selección` append Drive content
 *   with provenance and blank-line separation, focus the composer, and never
 *   submit, queue, or start an SSE/LLM request.
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
    stop: vi.fn(),
    runtime: 'idle' as 'idle' | 'streaming',
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
    runtime: mocks.runtime,
    error: null,
    send: mocks.send,
    stop: mocks.stop,
    setActivePatient: mocks.setActivePatient,
    updateDraft: vi.fn(),
    updateDraftSource: vi.fn(async () => true),
    updateDraftDate: vi.fn(),
    regenerateDraft: vi.fn(),
    prepareDraft: vi.fn(async () => null),
    resolve: vi.fn(async () => {}),
    backToEdit: vi.fn(async () => true),
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
    listDriveSources: vi.fn(),
    searchDriveFiles: vi.fn(),
    getDriveFile: vi.fn(),
    createDriveFile: vi.fn(),
    updateDriveFile: vi.fn(),
    importDriveCopy: vi.fn(),
    recreateDriveWorkspace: vi.fn(),
    disconnectDrive: vi.fn(),
    getDrivePickerToken: vi.fn(),
    listDriveJournals: vi.fn(),
    getDriveJournalDetail: vi.fn(),
    getDriveJournalPreferences: vi.fn(),
    updateDriveJournalPreferences: vi.fn(),
  };
});

const apiSeam = api as unknown as {
  getPatients: ReturnType<typeof vi.fn>;
  getDriveStatus: ReturnType<typeof vi.fn>;
  listDriveFiles: ReturnType<typeof vi.fn>;
  listDriveSources: ReturnType<typeof vi.fn>;
  createDriveFile: ReturnType<typeof vi.fn>;
  updateDriveFile: ReturnType<typeof vi.fn>;
  listDriveJournals: ReturnType<typeof vi.fn>;
  getDriveJournalDetail: ReturnType<typeof vi.fn>;
  getDriveJournalPreferences: ReturnType<typeof vi.fn>;
  updateDriveJournalPreferences: ReturnType<typeof vi.fn>;
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
  mocks.runtime = 'idle';
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
  apiSeam.listDriveSources.mockResolvedValue({ files: [], next_page_token: null });
  apiSeam.listDriveJournals.mockResolvedValue({ journals: [] });
  apiSeam.getDriveJournalPreferences.mockResolvedValue({ frequency: 'weekly' });
  apiSeam.updateDriveJournalPreferences.mockResolvedValue({ frequency: 'weekly' });
  apiSeam.getDriveJournalDetail.mockResolvedValue({
    journal: {
      period_type: 'weekly',
      period_key: '2026-W37',
      journal_part: 2,
      display_name: 'Evoluciones — 2026-W37 — 2.txt',
      updated_at: '2026-09-13T12:00:00Z',
      entries: [
        {
          evolution_id: 'evolution-1',
          occurred_at: '2026-09-13T10:00:00Z',
          patient_display_name: 'Ana Pérez',
          patient_rut_masked: '12.345.•••-6',
          content: 'Contenido remoto del diario',
        },
      ],
    },
  });
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
  fireEvent.click(screen.getByRole('button', { name: 'Abrir Google Drive' }));
  const assistantMessage = screen.getByRole('article', { name: 'Asistente' });
  fireEvent.click(within(assistantMessage).getByRole('button', { name: 'Guardar copia en Drive' }));
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
  it('does not stop a clinical turn when Drive is closed and reopened', async () => {
    mocks.runtime = 'streaming';
    renderAssistant();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Google Drive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar Google Drive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Google Drive' }));
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cerrar Google Drive' })).toBeVisible();
  });
  it('places the single active-patient selector in the workspace header', () => {
    renderAssistant();

    const header = screen.getByRole('banner');
    expect(
      within(header).getByRole('button', { name: 'Seleccionar paciente activo' }),
    ).toHaveTextContent('Ana Pérez · 12.345.•••-6');
    expect(
      within(screen.getByTestId('clinical-composer')).queryByRole('button', {
        name: 'Seleccionar paciente activo',
      }),
    ).not.toBeInTheDocument();
  });

  it('changes the hook-owned patient through the header selector', async () => {
    renderAssistant();

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar paciente activo' }));
    fireEvent.click(await screen.findByRole('option', { name: /Bruno/ }));

    expect(mocks.setActivePatient).toHaveBeenCalledWith('p2');
  });

  it('starts closed and exposes one header launcher instead of a sidebar utility', () => {
    renderAssistant();

    const launcher = screen.getByRole('button', { name: 'Abrir Google Drive' });
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Conectado')).not.toBeInTheDocument();
  });

  it('returns focus to the header launcher after closing Drive', async () => {
    renderAssistant();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir Google Drive' }));
    await screen.findByText('Conectado');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar Google Drive' }));

    const launcher = await screen.findByRole('button', { name: 'Abrir Google Drive' });
    await waitFor(() => expect(launcher).toHaveFocus());
  });

  it('passes the active patient to the Drive workspace and loads its files', async () => {
    renderAssistant();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir Google Drive' }));

    expect(await screen.findByText('Conectado')).toBeInTheDocument();
    await waitFor(() => expect(apiSeam.listDriveFiles).toHaveBeenCalledWith('p1', undefined));
  });

  it('uses the current clinical thread patient when Drive stays open', async () => {
    const view = renderAssistant();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Google Drive' }));
    await waitFor(() => expect(apiSeam.listDriveFiles).toHaveBeenCalledWith('p1', undefined));

    mocks.thread.active_patient = {
      id: 'p2',
      first_name: 'Bruno',
      last_name: 'Gómez',
      rut_masked: '9.876.•••-1',
      birth_date: null,
    };
    view.rerender(
      <MemoryRouter initialEntries={['/a/t1']}>
        <Routes>
          <Route path="/a/:threadId" element={<ClinicalAssistant />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(apiSeam.listDriveFiles).toHaveBeenCalledWith('p2', undefined));
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

    const artifact = screen.getByRole('article', { name: 'Evolución clínica' });
    fireEvent.click(within(artifact).getByLabelText('Más acciones de la evolución'));
    fireEvent.click(within(artifact).getByRole('button', { name: 'Guardar copia en Drive' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Incorporar nota completa al borrador' }));

    expect(composer()).toHaveValue('nota previa');
    expect(screen.getByText('Respuesta del asistente.txt · selección')).toBeVisible();
    expect(composer()).toHaveFocus();
    expect(screen.getByRole('status', { name: 'Incorporado al borrador' })).toBeVisible();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(apiSeam.createDriveFile).not.toHaveBeenCalled();
  });

  it('disables every transfer action without an active patient', async () => {
    mocks.thread.active_patient = null;
    renderAssistant();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir Google Drive' }));

    await screen.findByText('Conectado');
    const transferButtons = screen.queryAllByRole('button', { name: 'Guardar copia en Drive' });
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

  it('carries the exact artifact journal target through the page into the reader', async () => {
    const baselineLength = mocks.items.length;
    mocks.items.push({
      id: 'approval-1',
      turnId: 'turn-1',
      status: 'completed',
      createdAt: '2026-09-10T12:00:02Z',
      type: 'approval',
      action: {
        id: 'approval-1',
        thread_id: 't1',
        turn_id: 'turn-1',
        artifact_id: 'd1',
        patient_id: 'p1',
        action_type: 'save_evolution',
        proposal_payload: null,
        proposal_hash: 'a'.repeat(64),
        status: 'approved',
        expires_at: '2026-09-10T13:00:00Z',
        created_at: '2026-09-10T12:00:02Z',
        resolved_at: '2026-09-10T12:00:03Z',
        result_resource_id: 'evolution-1',
        drive_export: {
          status: 'synced',
          journal: { period_type: 'weekly', period_key: '2026-W37', journal_part: 2 },
        },
      },
      patient: mocks.thread.active_patient,
    } as never);

    try {
      renderAssistant();
      fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));

      expect(await screen.findByText('Contenido remoto del diario')).toBeInTheDocument();
      expect(apiSeam.getDriveJournalDetail).toHaveBeenCalledWith('weekly', '2026-W37', 2);
      await waitFor(() => expect(screen.getByRole('article', { name: 'Ana Pérez' })).toHaveFocus());
    } finally {
      mocks.items.splice(baselineLength);
    }
  });
});

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ClinicalAssistantController,
  ClinicalRuntime,
} from '../../hooks/useClinicalAssistant';
import {
  type ClinicalPatient,
  type ClinicalThread,
  type Patient,
  getPatients,
} from '../../lib/api';
import { ClinicalAssistantArea } from './ClinicalAssistantArea';

const send = vi.fn();
const runtime = vi.hoisted(() => ({ value: 'streaming' as ClinicalRuntime }));
const assistantState = vi.hoisted(() => ({
  thread: null as ClinicalThread | null,
  setActivePatient: vi.fn(),
}));

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, getPatients: vi.fn().mockResolvedValue([]) };
});

function createAssistant(): ClinicalAssistantController {
  return {
    thread: assistantState.thread,
    items: [],
    runtime: runtime.value,
    error: null,
    send,
    stop: vi.fn(),
    setActivePatient: assistantState.setActivePatient,
    updateDraft: vi.fn(),
    updateDraftSource: vi.fn(),
    updateDraftDate: vi.fn(),
    regenerateDraft: vi.fn(),
    prepareDraft: vi.fn(),
    resolve: vi.fn(),
    backToEdit: vi.fn(),
    patientSwitch: null,
    cancelPatientSwitch: vi.fn(),
    confirmPatientSwitch: vi.fn(),
    reload: vi.fn(async () => assistantState.thread),
    retryTurn: vi.fn(),
    retryDriveExport: vi.fn(),
    artifactSyncState: {},
    retryArtifactSync: vi.fn(),
  };
}

function createThread(activePatient: ClinicalPatient | null): ClinicalThread {
  return {
    id: 'thread-1',
    owner_user_id: 'user-1',
    title: 'Asistente',
    active_patient: activePatient,
    pending_action_patient: null,
    active_turn_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    messages: [],
    artifacts: [],
    pending_action: null,
    actions: [],
  };
}

describe('ClinicalAssistantArea queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.value = 'streaming';
    assistantState.thread = createThread(null);
    vi.mocked(getPatients).mockResolvedValue([]);
  });

  it('keeps the fourth draft when three messages are already queued', () => {
    render(<ClinicalAssistantArea threadId="thread-1" assistant={createAssistant()} />);
    const composer = screen.getByRole('textbox', { name: 'Nota clínica' });
    const submit = screen.getByRole('button', { name: 'Poner mensaje en cola' });

    for (const message of ['Uno', 'Dos', 'Tres']) {
      fireEvent.change(composer, { target: { value: message } });
      fireEvent.click(submit);
    }
    fireEvent.change(composer, { target: { value: 'Cuatro' } });
    fireEvent.click(submit);

    expect(composer).toHaveValue('Cuatro');
    expect(screen.getByRole('alert')).toHaveTextContent('Ya tienes 3 mensajes pendientes.');
    expect(screen.getByText('3 mensajes en cola')).toBeVisible();
  });

  it('preserves composer text but blocks submission while approval is pending', () => {
    runtime.value = 'awaiting_approval';
    render(<ClinicalAssistantArea threadId="thread-1" assistant={createAssistant()} />);
    const composer = screen.getByRole('textbox', { name: 'Nota clínica' });

    fireEvent.change(composer, { target: { value: 'Siguiente nota' } });

    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
    expect(composer).toHaveValue('Siguiente nota');
    expect(screen.getByText('Revisa la evolución pendiente antes de continuar.')).toBeVisible();
    expect(screen.queryByText(/mensaje.*en cola/)).not.toBeInTheDocument();
  });

  it('shows selection progress, preserves the previous patient, and retries failures', async () => {
    const selectablePatient: Patient = {
      id: 'patient-1',
      first_name: 'Ana',
      last_name: 'Pérez',
      rut_masked: '12.345.•••-6',
      birth_date: '1990-01-01',
      last_evolution_at: null,
    };
    let rejectSelection: ((reason?: unknown) => void) | undefined;
    assistantState.setActivePatient.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSelection = reject;
        }),
    );
    assistantState.setActivePatient.mockResolvedValueOnce(undefined);
    vi.mocked(getPatients).mockResolvedValue([selectablePatient]);

    render(<ClinicalAssistantArea threadId="thread-1" assistant={createAssistant()} />);

    const trigger = screen.getByRole('button', { name: 'Seleccionar paciente activo' });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('option', { name: /Ana Pérez/ }));

    expect(screen.getByText('Guardando paciente…')).toBeVisible();
    expect(trigger).toBeDisabled();

    await waitFor(() => expect(assistantState.setActivePatient).toHaveBeenCalledOnce());
    rejectSelection?.(new Error('selection failed'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cambiar el paciente activo.');
    expect(trigger).toHaveTextContent('Seleccionar paciente');
    expect(trigger).toBeEnabled();

    fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(assistantState.setActivePatient).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

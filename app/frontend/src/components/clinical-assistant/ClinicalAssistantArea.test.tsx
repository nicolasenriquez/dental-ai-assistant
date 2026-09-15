import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ClinicalPatient, type Patient, getPatients } from '../../lib/api';
import { ClinicalAssistantArea } from './ClinicalAssistantArea';

const send = vi.fn();
const runtime = vi.hoisted(() => ({ value: 'streaming' }));
const assistantState = vi.hoisted(() => ({
  thread: null as { title: string; active_patient: ClinicalPatient | null } | null,
  setActivePatient: vi.fn(),
}));

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, getPatients: vi.fn().mockResolvedValue([]) };
});

vi.mock('../../hooks/useClinicalAssistant', () => ({
  useClinicalAssistant: () => ({
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
    retryTurn: vi.fn(),
    artifactSyncState: {},
    retryArtifactSync: vi.fn(),
  }),
}));

describe('ClinicalAssistantArea queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.value = 'streaming';
    assistantState.thread = { title: 'Asistente', active_patient: null };
    vi.mocked(getPatients).mockResolvedValue([]);
  });

  it('keeps the fourth draft when three messages are already queued', () => {
    render(<ClinicalAssistantArea threadId="thread-1" />);
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

  it('preserves the draft and does not queue while approval is pending', () => {
    runtime.value = 'awaiting_approval';
    render(<ClinicalAssistantArea threadId="thread-1" />);
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

    render(<ClinicalAssistantArea threadId="thread-1" />);

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

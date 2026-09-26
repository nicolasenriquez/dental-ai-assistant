import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    activeTurnId: runtime.value === 'streaming' || runtime.value === 'stopping' ? 'turn-1' : null,
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
    send.mockResolvedValue(true);
    runtime.value = 'streaming';
    assistantState.thread = createThread(null);
    vi.mocked(getPatients).mockResolvedValue([]);
  });

  it('keeps the fourth draft when three messages are already queued', () => {
    render(<ClinicalAssistantArea threadId="thread-1" assistant={createAssistant()} />);
    const composer = screen.getByRole('textbox', { name: 'Nota clínica' });
    for (const message of ['Uno', 'Dos', 'Tres']) {
      fireEvent.change(composer, { target: { value: message } });
      fireEvent.click(screen.getByRole('button', { name: 'Encolar' }));
    }
    fireEvent.change(composer, { target: { value: 'Cuatro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Encolar' }));

    expect(composer).toHaveValue('Cuatro');
    expect(screen.getByRole('alert')).toHaveTextContent('Ya tienes 3 mensajes pendientes.');
    expect(screen.getByText('Pendientes 3/3')).toBeVisible();
  });

  it('preserves composer text but blocks submission while approval is pending', () => {
    runtime.value = 'awaiting_approval';
    render(<ClinicalAssistantArea threadId="thread-1" assistant={createAssistant()} />);
    const composer = screen.getByRole('textbox', { name: 'Nota clínica' });

    fireEvent.change(composer, { target: { value: 'Siguiente nota' } });

    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
    expect(composer).toHaveValue('Siguiente nota');
    expect(screen.getByText('Evolución pendiente de revisión · Ver')).toBeVisible();
    expect(screen.queryByText(/mensaje.*en cola/)).not.toBeInTheDocument();
  });

  it('shows patient status only for an active patient and reuses the header picker', async () => {
    const patient: ClinicalPatient = {
      id: 'patient-1',
      first_name: 'Ana',
      last_name: 'Pérez',
      rut_masked: '12.345.•••-6',
      birth_date: '1990-01-01',
    };
    assistantState.thread = createThread(patient);
    runtime.value = 'idle';
    render(<ClinicalAssistantArea threadId="thread-1" assistant={createAssistant()} />);

    const statusTrigger = screen.getByRole('button', { name: 'Contexto' });
    fireEvent.click(statusTrigger);
    const region = screen.getByRole('region', { name: 'Paciente' });
    expect(within(region).getByText('12.345.•••-6')).toBeVisible();
    expect(region).not.toHaveTextContent('patient-1');

    fireEvent.click(within(region).getByRole('button', { name: 'Cambiar paciente' }));
    expect(screen.getByRole('button', { name: 'Seleccionar paciente activo' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('opens the header patient picker or Drive from the composer tools', () => {
    const onToggleDrive = vi.fn();
    render(
      <ClinicalAssistantArea
        threadId="thread-1"
        assistant={createAssistant()}
        onToggleDrive={onToggleDrive}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Contexto' }));
    expect(screen.getByRole('button', { name: 'Seleccionar paciente activo' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Añadir contexto desde Drive' }));
    expect(onToggleDrive).toHaveBeenCalledOnce();
  });

  it('keeps agent Stop outside the voice controls', () => {
    const assistant = createAssistant();
    render(<ClinicalAssistantArea threadId="thread-1" assistant={assistant} />);

    fireEvent.click(screen.getByRole('button', { name: 'Detener respuesta' }));
    expect(assistant.stop).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Iniciar dictado' })).toBeVisible();
  });

  it('keeps the next message draft when Stop is pressed', () => {
    const assistant = createAssistant();
    render(<ClinicalAssistantArea threadId="thread-1" assistant={assistant} />);
    const composer = screen.getByRole('textbox', { name: 'Nota clínica' });
    fireEvent.change(composer, { target: { value: 'Siguiente indicación' } });
    fireEvent.click(screen.getByRole('button', { name: 'Detener respuesta' }));
    expect(assistant.stop).toHaveBeenCalledOnce();
    expect(composer).toHaveValue('Siguiente indicación');
    expect(screen.getByRole('button', { name: 'Encolar' })).toBeVisible();
  });

  it('keeps queued messages with their original patient after a patient change', () => {
    const patientA = { id: 'patient-a', first_name: 'Ana', last_name: 'Pérez', rut_masked: '••••' };
    const patientB = {
      id: 'patient-b',
      first_name: 'Bruno',
      last_name: 'Ríos',
      rut_masked: '••••',
    };
    assistantState.thread = createThread(patientA);
    const view = render(
      <ClinicalAssistantArea threadId="thread-1" assistant={createAssistant()} />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Nota clínica' }), {
      target: { value: 'Para Ana' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Encolar' }));
    assistantState.thread = createThread(patientB);
    runtime.value = 'idle';
    view.rerender(<ClinicalAssistantArea threadId="thread-1" assistant={createAssistant()} />);
    expect(screen.getByText(/Este mensaje fue escrito para Ana Pérez/)).toBeVisible();
    expect(send).not.toHaveBeenCalled();
  });

  it('sends Drive context separately from the instruction', () => {
    runtime.value = 'idle';
    let insertContext: ((item: import('../../lib/api').ComposerContextItem) => void) | undefined;
    render(
      <ClinicalAssistantArea
        threadId="thread-1"
        assistant={createAssistant()}
        onComposerInsertReady={(insert) => {
          insertContext = insert;
        }}
      />,
    );
    act(() => {
      insertContext?.({
        id: 'context-1',
        kind: 'drive_selection',
        sourceId: 'drive-file-1',
        sourceName: 'Evaluación.md',
        content: 'Control en seis meses',
      });
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nota clínica' }), {
      target: { value: 'Actualizar evolución' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));

    expect(send).toHaveBeenCalledWith('Actualizar evolución', [
      expect.objectContaining({ sourceName: 'Evaluación.md', content: 'Control en seis meses' }),
    ]);
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

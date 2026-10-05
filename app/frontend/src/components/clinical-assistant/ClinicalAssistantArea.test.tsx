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
    detach: vi.fn(),
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

  it('preserves text, attachments and queue order when editing conflicts', async () => {
    let insert: ((item: import('../../lib/api').ComposerContextItem) => void) | undefined;
    render(
      <ClinicalAssistantArea
        threadId="thread-1"
        assistant={createAssistant()}
        onComposerInsertReady={(callback) => {
          insert = callback;
        }}
      />,
    );
    await waitFor(() => expect(getPatients).toHaveBeenCalled());
    const composer = screen.getByRole('textbox', { name: 'Consulta al asistente' });
    const attachment = {
      id: 'queued-doc',
      kind: 'drive_selection' as const,
      sourceId: 'file-1',
      sourceName: 'Pendiente.md',
      content: 'Contenido pendiente',
    };
    act(() => insert?.(attachment));
    fireEvent.change(composer, { target: { value: 'Primero' } });
    fireEvent.click(screen.getByRole('button', { name: 'Encolar' }));
    fireEvent.change(composer, { target: { value: 'Segundo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Encolar' }));
    fireEvent.change(composer, { target: { value: 'Nota actual' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]);
    expect(composer).toHaveValue('Nota actual');
    expect(screen.getByText('Mensajes en cola 2/3')).toBeVisible();
    expect(send).not.toHaveBeenCalled();
    fireEvent.change(composer, { target: { value: '' } });
    act(() => insert?.({ ...attachment, id: 'current-doc', sourceName: 'Actual.md' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]);
    expect(screen.getByRole('group', { name: 'Documentos adjuntos' })).toHaveTextContent(
      'Actual.md',
    );
    expect(screen.getByText('Mensajes en cola 2/3')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Quitar.*Actual/ }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]);
    expect(composer).toHaveValue('Primero');
    expect(screen.getByRole('group', { name: 'Documentos adjuntos' })).toHaveTextContent(
      'Pendiente.md',
    );
    expect(screen.getByText('Mensajes en cola 1/3')).toBeVisible();
    expect(screen.getByText('Segundo')).toBeVisible();
    expect(send).not.toHaveBeenCalled();
  });

  it('claims a queued message before idle rerenders and restores a rejected delivery', async () => {
    let resolve!: (accepted: boolean) => void;
    send.mockReturnValueOnce(
      new Promise<boolean>((done) => {
        resolve = done;
      }),
    );
    const view = render(
      <ClinicalAssistantArea threadId="thread-1" assistant={createAssistant()} />,
    );
    const composer = screen.getByRole('textbox', { name: 'Consulta al asistente' });
    fireEvent.change(composer, { target: { value: 'Una sola entrega' } });
    fireEvent.click(screen.getByRole('button', { name: 'Encolar' }));
    runtime.value = 'idle';
    view.rerender(<ClinicalAssistantArea threadId="thread-1" assistant={createAssistant()} />);
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    view.rerender(<ClinicalAssistantArea threadId="thread-1" assistant={createAssistant()} />);
    expect(send).toHaveBeenCalledOnce();
    await act(async () => resolve(false));
    expect(screen.getByText('Una sola entrega')).toBeVisible();
    expect(send).toHaveBeenCalledOnce();
    const failedAssistant = createAssistant();
    failedAssistant.runtime = 'failed';
    let reconcile!: (fresh: ClinicalThread | null) => void;
    failedAssistant.reload = vi.fn(
      () =>
        new Promise<ClinicalThread | null>((done) => {
          reconcile = done;
        }),
    );
    view.rerender(<ClinicalAssistantArea threadId="thread-1" assistant={failedAssistant} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar cola' }));
    expect(failedAssistant.reload).toHaveBeenCalledOnce();
    await act(async () => reconcile(assistantState.thread));
    view.rerender(<ClinicalAssistantArea threadId="thread-1" assistant={createAssistant()} />);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  });

  it('resumes the exact artifact in an embedded region without another main', async () => {
    runtime.value = 'idle';
    const assistant = createAssistant();
    const draft = {
      context: 'Control preventivo',
      findings: '',
      assessment: '',
      treatment: '',
      follow_up: '',
      review_flags: [],
    };
    assistant.items = [
      {
        type: 'draft',
        id: 'draft-resume',
        turnId: 'turn-1',
        status: 'completed',
        createdAt: '2026-10-05T12:00:00Z',
        artifactStatus: 'draft',
        draft,
        baseline: draft,
        sourceNote: 'Nota',
        edited: false,
        stale: false,
        patientId: 'p',
        evolutionAt: '2026-10-05T12:00:00Z',
      },
    ];
    render(
      <ClinicalAssistantArea
        threadId="thread-1"
        assistant={assistant}
        embedded
        resumeTarget={{ kind: 'artifact', id: 'draft-resume' }}
      />,
    );
    expect(screen.getByRole('region', { name: 'Conversación del paciente' })).toBeVisible();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Asistente' })).toBeVisible();
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('data-artifact-id', 'draft-resume'),
    );
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['Preparar evolución', 'Consultar evoluciones'])(
    'prefills %s without sending or overwriting work',
    (label) => {
      runtime.value = 'idle';
      assistantState.thread = createThread({
        id: 'p',
        first_name: 'Ana',
        last_name: 'Pérez',
        rut_masked: '••••',
      });
      const assistant = createAssistant();
      render(<ClinicalAssistantArea threadId="thread-1" assistant={assistant} />);
      fireEvent.click(screen.getByRole('button', { name: label }));
      const composer = screen.getByRole('textbox', { name: 'Nota clínica' });
      expect(composer).not.toHaveValue('');
      expect(send).not.toHaveBeenCalled();
      expect(assistant.prepareDraft).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
      fireEvent.change(composer, { target: { value: 'Trabajo propio' } });
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(composer).toHaveValue('Trabajo propio');
    },
  );

  it('keeps the fourth draft when three messages are already queued', () => {
    render(<ClinicalAssistantArea threadId="thread-1" assistant={createAssistant()} />);
    const composer = screen.getByRole('textbox', { name: 'Consulta al asistente' });
    for (const message of ['Uno', 'Dos', 'Tres']) {
      fireEvent.change(composer, { target: { value: message } });
      fireEvent.click(screen.getByRole('button', { name: 'Encolar' }));
    }
    fireEvent.change(composer, { target: { value: 'Cuatro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Encolar' }));

    expect(composer).toHaveValue('Cuatro');
    expect(screen.getByRole('alert')).toHaveTextContent('Ya tienes 3 mensajes pendientes.');
    expect(screen.getByText('Mensajes en cola 3/3')).toBeVisible();
  });

  it('preserves composer text but blocks submission while approval is pending', () => {
    runtime.value = 'awaiting_approval';
    render(<ClinicalAssistantArea threadId="thread-1" assistant={createAssistant()} />);
    const composer = screen.getByRole('textbox', { name: 'Consulta al asistente' });

    fireEvent.change(composer, { target: { value: 'Siguiente nota' } });

    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
    expect(composer).toHaveValue('Siguiente nota');
    expect(screen.getByText('Evolución pendiente de revisión')).toBeVisible();
    expect(screen.queryByText(/mensaje.*en cola/)).not.toBeInTheDocument();
  });

  it('shows the active patient in the header and changes it there', async () => {
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

    const trigger = screen.getByRole('button', { name: 'Cambiar paciente activo' });
    expect(trigger).toHaveTextContent('Ana Pérez');
    expect(trigger).toHaveTextContent('12.345.•••-6');
    expect(screen.getByText('Prepara una evolución clínica')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Nota clínica' })).toHaveAttribute(
      'placeholder',
      'Escribe o dicta la nota clínica…',
    );
    expect(screen.queryByRole('button', { name: 'Contexto' })).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('offers state-specific empty actions and uses the header for Drive', () => {
    const onToggleDrive = vi.fn();
    runtime.value = 'idle';
    render(
      <ClinicalAssistantArea
        threadId="thread-1"
        assistant={createAssistant()}
        onToggleDrive={onToggleDrive}
      />,
    );

    expect(screen.getByText('¿Qué necesitas hacer?')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Consulta al asistente' })).toHaveAttribute(
      'placeholder',
      'Escribe una consulta general…',
    );
    const header = document.querySelector('.workspace-header') as HTMLElement;
    fireEvent.click(
      within(document.querySelector('.clinical-empty-actions') as HTMLElement).getByRole('button', {
        name: 'Seleccionar paciente',
      }),
    );
    expect(within(header).getByRole('button', { name: 'Seleccionar paciente' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Google Drive' }));
    expect(onToggleDrive).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole('button', { name: 'Añadir contexto desde Drive' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Escribir consulta general' }));
    expect(screen.getByRole('textbox', { name: 'Consulta al asistente' })).toHaveFocus();
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
    const composer = screen.getByRole('textbox', { name: 'Consulta al asistente' });
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
    expect(screen.getByRole('group', { name: 'Documentos adjuntos' })).toHaveTextContent(
      'Evaluación.md · Google Drive',
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Consulta al asistente' }), {
      target: { value: 'Actualizar evolución' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));

    expect(send).toHaveBeenCalledWith('Actualizar evolución', [
      expect.objectContaining({ sourceName: 'Evaluación.md', content: 'Control en seis meses' }),
    ]);
  });

  it('removes a Drive attachment without clearing the typed consultation', () => {
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
    const composer = screen.getByRole('textbox', { name: 'Consulta al asistente' });
    fireEvent.change(composer, { target: { value: 'Mi consulta' } });
    act(() => {
      insertContext?.({
        id: 'context-1',
        kind: 'drive_selection',
        sourceId: 'drive-file-1',
        sourceName: 'Evaluación.md',
        content: 'Control en seis meses',
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Evaluación.md' }));
    expect(screen.queryByRole('group', { name: 'Documentos adjuntos' })).not.toBeInTheDocument();
    expect(composer).toHaveValue('Mi consulta');
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

    const trigger = within(document.querySelector('.workspace-header') as HTMLElement).getByRole(
      'button',
      { name: 'Seleccionar paciente' },
    );
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

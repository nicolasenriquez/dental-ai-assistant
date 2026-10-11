/**
 * Task 7.1 fail-first suite for F02/F08 (explicit original-context unsent work).
 *
 * Red until task 7.2 keys composer text/attachments/queue by
 * `(threadId, patientId|null)` and stages the patient transition through the
 * existing guard with remain/preserve/discard outcomes.
 *
 * Pinned interface for 7.2:
 * - Patient change with unsent work in a different context shows an
 *   `alertdialog` named `Trabajo sin enviar` with `Mantener paciente` (remain),
 *   `Conservar y cambiar` (preserve) and `Descartar y cambiar` (discard).
 * - Preserve changes the workspace, keeps the work labelled with its original
 *   context (`Borrador conservado para <name>.` / `Borrador conservado sin
 *   paciente.`), blocks sending/dispatch and exposes `Volver a <name>` /
 *   `Volver a Sin paciente` as a guarded restore (including the null action).
 * - Discard is staged: the work is cleared only after the patient update
 *   succeeds; a failed update keeps the work and the previous context.
 * - The restore control stays available but disabled while voice, saving or
 *   approval is in flight (the existing restrictions).
 * - Artifact edit buffers are bound to their artifact's historical patient and
 *   never follow the workspace patient.
 *
 * Red cases: patient boundary presence, remain, preserve, restore, discard,
 * failed update, null -> patient, active-patient removal, null queue restore,
 * review-pending restore block.
 * Green guards: no auto-dispatch of mismatched queue, voice/thread isolation,
 * artifact buffer continuity.
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceState } from '../../hooks/useVoiceDictation';
import type {
  ClinicalDraft,
  ClinicalPatient,
  ClinicalPendingAction,
  ClinicalThread,
  ClinicalTurnArtifact,
  ComposerContextItem,
  Patient,
} from '../../lib/api';
import * as api from '../../lib/api';
import {
  ClinicalRuntimeProvider,
  useClinicalComposerMemory,
  useOptionalClinicalRuntime,
} from '../ClinicalRuntimeProvider';
import { ClinicalAssistantArea } from './ClinicalAssistantArea';

const voice = vi.hoisted(() => ({ state: 'idle' as VoiceState }));

vi.mock('../../hooks/useVoiceDictation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useVoiceDictation')>();
  return {
    ...actual,
    useVoiceDictation: () => ({
      state: voice.state,
      elapsed: 0,
      error: null,
      canRetry: false,
      stream: null,
      start: vi.fn(),
      stop: vi.fn(),
      cancel: vi.fn(),
      retry: vi.fn(),
    }),
  };
});

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    getClinicalThread: vi.fn(),
    getPatients: vi.fn(),
    setClinicalActivePatient: vi.fn(),
    streamClinicalTurn: vi.fn(),
  };
});

const PATIENT_A: ClinicalPatient = {
  id: 'patient-a',
  first_name: 'Ana',
  last_name: 'Pérez',
  rut_masked: '••••',
};
const PATIENT_B: ClinicalPatient = {
  id: 'patient-b',
  first_name: 'Bruno',
  last_name: 'Ríos',
  rut_masked: '••••',
};

const DIRECTORY: Patient[] = [
  { ...PATIENT_A, last_evolution_at: null },
  { ...PATIENT_B, last_evolution_at: null },
];

const DRAFT: ClinicalDraft = {
  context: 'Control preventivo.',
  findings: 'Sin hallazgos nuevos.',
  assessment: 'Salud periodontal estable.',
  treatment: 'Mantener higiene.',
  follow_up: 'Control en seis meses.',
  review_flags: [],
};

function artifact(): ClinicalTurnArtifact {
  return {
    id: 'artifact-1',
    owner_user_id: 'owner',
    thread_id: 'a',
    turn_id: 'turn-1',
    patient_id: PATIENT_A.id,
    artifact_type: 'clinical_draft',
    status: 'draft',
    source_note: 'Nota clínica original',
    generated_draft: DRAFT,
    draft: DRAFT,
    evolution_at: '2026-10-01T12:00:00Z',
    created_at: '2026-10-01T12:00:00Z',
    updated_at: '2026-10-01T12:00:00Z',
    patient: PATIENT_A,
  };
}

const PENDING_ACTION: ClinicalPendingAction = {
  id: 'action-1',
  thread_id: 'a',
  turn_id: 'turn-1',
  artifact_id: null,
  patient_id: PATIENT_A.id,
  action_type: 'save_evolution',
  proposal_payload: null,
  proposal_hash: 'a'.repeat(64),
  status: 'pending',
  expires_at: '2026-10-02T12:00:00Z',
  created_at: '2026-10-01T12:00:00Z',
  resolved_at: null,
  result_resource_id: null,
  patient: PATIENT_A,
  drive_export: null,
};

const threadState: Record<string, ClinicalPatient | null> = {};
const threadExtras: Record<string, Partial<ClinicalThread>> = {};
const memoryRef: { current: ReturnType<typeof useClinicalComposerMemory> } = { current: null };
let insertContext: ((item: ComposerContextItem) => void) | undefined;

function clinicalThread(id: string, activePatient: ClinicalPatient | null): ClinicalThread {
  return {
    id,
    owner_user_id: 'owner',
    title: `Hilo ${id}`,
    active_patient: activePatient,
    pending_action_patient: null,
    active_turn_id: null,
    created_at: '2026-10-01T12:00:00Z',
    updated_at: '2026-10-01T12:00:00Z',
    messages: [],
    artifacts: [],
    pending_action: null,
    actions: [],
    ...(threadExtras[id] ?? {}),
  };
}

function AreaRoute(): JSX.Element | null {
  const { threadId } = useParams<{ threadId: string }>();
  const shared = useOptionalClinicalRuntime();
  if (!threadId || !shared) return null;
  return (
    <ClinicalAssistantArea
      threadId={threadId}
      assistant={shared.controller}
      onComposerInsertReady={(callback) => {
        insertContext = callback;
      }}
    />
  );
}

function MemoryProbe(): null {
  memoryRef.current = useClinicalComposerMemory();
  return null;
}

function renderHarness(entry = '/a/a'): void {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ClinicalRuntimeProvider>
        <MemoryProbe />
        <nav>
          <Link to="/a/a">Hilo A</Link>
          <Link to="/a/b">Hilo B</Link>
        </nav>
        <Routes>
          <Route path="/a/:threadId" element={<AreaRoute />} />
        </Routes>
      </ClinicalRuntimeProvider>
    </MemoryRouter>,
  );
}

const composer = (): HTMLElement =>
  screen.getByRole('textbox', { name: /Nota clínica|Consulta al asistente|Borrador para/ });

const boundary = (): HTMLElement => screen.getByRole('alertdialog', { name: 'Trabajo sin enviar' });

async function choosePatient(name: RegExp): Promise<void> {
  const header = document.querySelector('.workspace-header') as HTMLElement;
  const trigger = within(header).getByRole('button', {
    name: /Seleccionar paciente|Cambiar paciente activo/,
  });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole('option', { name }));
}

beforeEach(() => {
  voice.state = 'idle';
  insertContext = undefined;
  memoryRef.current = null;
  for (const key of Object.keys(threadState)) delete threadState[key];
  for (const key of Object.keys(threadExtras)) delete threadExtras[key];
  threadState.a = PATIENT_A;
  threadState.b = null;
  vi.mocked(api.getPatients).mockResolvedValue(DIRECTORY);
  vi.mocked(api.getClinicalThread).mockImplementation(async (id) =>
    clinicalThread(id, threadState[id] ?? null),
  );
  vi.mocked(api.setClinicalActivePatient).mockImplementation(async (id, patientId) => {
    threadState[id] =
      patientId === PATIENT_A.id ? PATIENT_A : patientId === PATIENT_B.id ? PATIENT_B : null;
    return clinicalThread(id, threadState[id]);
  });
  vi.mocked(api.streamClinicalTurn).mockImplementation(
    async () =>
      new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('assistant patient-context transitions', () => {
  it('asks for a decision before changing patient A while unsent text exists', async () => {
    renderHarness();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nota clínica' }), {
      target: { value: 'Nota para Ana' },
    });

    await choosePatient(/Bruno Ríos/);

    expect(boundary()).toBeVisible();
    expect(screen.getByRole('button', { name: 'Mantener paciente' })).toHaveFocus();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(api.setClinicalActivePatient).not.toHaveBeenCalled();
  });

  it('remain keeps patient A and the unsent work', async () => {
    renderHarness();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nota clínica' }), {
      target: { value: 'Nota para Ana' },
    });
    await choosePatient(/Bruno Ríos/);

    fireEvent.click(screen.getByRole('button', { name: 'Mantener paciente' }));

    expect(api.setClinicalActivePatient).not.toHaveBeenCalled();
    expect(composer()).toHaveValue('Nota para Ana');
    expect(
      screen.queryByRole('alertdialog', { name: 'Trabajo sin enviar' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(composer()).toHaveFocus());
  });

  it('keeps the context decision locked until the patient change finishes', async () => {
    let finish!: (value: ClinicalThread) => void;
    vi.mocked(api.setClinicalActivePatient).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderHarness();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nota clínica' }), {
      target: { value: 'Nota para Ana' },
    });
    await choosePatient(/Bruno Ríos/);
    fireEvent.click(screen.getByRole('button', { name: 'Conservar y cambiar' }));
    for (const button of within(boundary()).getAllByRole('button')) expect(button).toBeDisabled();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(boundary()).toBeVisible();
    expect(api.setClinicalActivePatient).toHaveBeenCalledOnce();
    await act(async () => {
      finish(clinicalThread('a', PATIENT_B));
    });
    expect(await screen.findByRole('textbox', { name: 'Borrador para Ana Pérez' })).toHaveValue(
      'Nota para Ana',
    );
  });

  it('preserve keeps the work labelled to A and blocks sending under B', async () => {
    renderHarness();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nota clínica' }), {
      target: { value: 'Nota para Ana' },
    });
    await choosePatient(/Bruno Ríos/);

    fireEvent.click(screen.getByRole('button', { name: 'Conservar y cambiar' }));

    await waitFor(() =>
      expect(api.setClinicalActivePatient).toHaveBeenCalledWith('a', PATIENT_B.id),
    );
    expect(await screen.findByText(/Borrador conservado para Ana Pérez/)).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Borrador para Ana Pérez' })).toHaveValue(
      'Nota para Ana',
    );
    expect(composer()).toHaveValue('Nota para Ana');
    const send = screen.getByRole('button', { name: 'Enviar mensaje' });
    expect(send).toBeDisabled();
    fireEvent.click(send);
    expect(api.streamClinicalTurn).not.toHaveBeenCalled();
  });

  it('restores the original patient and recovers preserved work', async () => {
    renderHarness();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nota clínica' }), {
      target: { value: 'Nota para Ana' },
    });
    await choosePatient(/Bruno Ríos/);
    fireEvent.click(screen.getByRole('button', { name: 'Conservar y cambiar' }));
    await waitFor(() =>
      expect(api.setClinicalActivePatient).toHaveBeenCalledWith('a', PATIENT_B.id),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Volver a Ana Pérez' }));

    await waitFor(() =>
      expect(api.setClinicalActivePatient).toHaveBeenLastCalledWith('a', PATIENT_A.id),
    );
    expect(await screen.findByRole('textbox', { name: 'Nota clínica' })).toHaveValue(
      'Nota para Ana',
    );
    expect(screen.queryByText(/Borrador conservado/)).not.toBeInTheDocument();
  });

  it('discards the affected work only after the patient change succeeds', async () => {
    renderHarness();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nota clínica' }), {
      target: { value: 'Nota para Ana' },
    });
    await choosePatient(/Bruno Ríos/);

    fireEvent.click(screen.getByRole('button', { name: 'Descartar y cambiar' }));

    await waitFor(() =>
      expect(api.setClinicalActivePatient).toHaveBeenCalledWith('a', PATIENT_B.id),
    );
    expect(await screen.findByRole('textbox', { name: 'Nota clínica' })).toHaveValue('');
    await choosePatient(/Ana Pérez/);
    expect(await screen.findByRole('textbox', { name: 'Nota clínica' })).toHaveValue('');
  });

  it('keeps the work and previous context when the patient change fails', async () => {
    vi.mocked(api.setClinicalActivePatient).mockRejectedValueOnce(new Error('offline'));
    renderHarness();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nota clínica' }), {
      target: { value: 'Nota para Ana' },
    });
    await choosePatient(/Bruno Ríos/);

    fireEvent.click(screen.getByRole('button', { name: 'Descartar y cambiar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cambiar el paciente activo.',
    );
    expect(within(boundary()).getByRole('alert')).toHaveTextContent('No pudimos cambiar');
    fireEvent.click(screen.getByRole('button', { name: 'Mantener paciente' }));
    expect(composer()).toHaveValue('Nota para Ana');
    expect(api.streamClinicalTurn).not.toHaveBeenCalled();
  });

  it('requests the same decision when moving from a general context to a patient', async () => {
    threadState.a = null;
    renderHarness();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Consulta al asistente' }), {
      target: { value: 'Consulta general' },
    });

    await choosePatient(/Ana Pérez/);

    expect(boundary()).toBeVisible();
    expect(screen.getByText(/Trabajo sin enviar sin paciente/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Conservar y cambiar' }));
    await waitFor(() =>
      expect(api.setClinicalActivePatient).toHaveBeenCalledWith('a', PATIENT_A.id),
    );
    expect(await screen.findByText(/Borrador conservado sin paciente/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Volver a Sin paciente' }));
    await waitFor(() => expect(api.setClinicalActivePatient).toHaveBeenLastCalledWith('a', null));
    expect(await screen.findByRole('textbox', { name: 'Consulta al asistente' })).toHaveValue(
      'Consulta general',
    );
  });

  it('asks first when removing the active patient with text and an attachment', async () => {
    renderHarness();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nota clínica' }), {
      target: { value: 'Nota para Ana' },
    });
    act(() =>
      insertContext?.({
        id: 'context-1',
        kind: 'drive_selection',
        sourceId: 'file-1',
        sourceName: 'Control.md',
        content: 'Control previo',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Quitar paciente activo' }));

    expect(boundary()).toBeVisible();
    expect(api.setClinicalActivePatient).not.toHaveBeenCalled();
  });

  it('restores a null-context queued message through the guarded transition', async () => {
    renderHarness();
    await screen.findByRole('textbox', { name: 'Nota clínica' });
    act(() =>
      memoryRef.current?.setQueues((current) => ({
        ...current,
        a: [
          {
            id: 'q1',
            content: 'Consulta general',
            contextItems: [],
            patientId: null,
            patientName: 'Sin paciente',
          },
        ],
      })),
    );

    expect(screen.getByText(/Este mensaje fue escrito para Sin paciente/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a Sin paciente' }));

    await waitFor(() => expect(api.setClinicalActivePatient).toHaveBeenCalledWith('a', null));
  });

  it('does not auto-dispatch a queued message whose context differs from the patient', async () => {
    threadState.a = PATIENT_B;
    renderHarness();
    await screen.findByRole('textbox', { name: 'Nota clínica' });
    act(() =>
      memoryRef.current?.setQueues((current) => ({
        ...current,
        a: [
          {
            id: 'q1',
            content: 'Para Ana',
            contextItems: [],
            patientId: PATIENT_A.id,
            patientName: 'Ana Pérez',
          },
        ],
      })),
    );

    expect(await screen.findByText(/Este mensaje fue escrito para Ana Pérez/)).toBeVisible();
    expect(api.streamClinicalTurn).not.toHaveBeenCalled();
  });

  it('blocks patient change while dictation is in flight', async () => {
    voice.state = 'recording';
    renderHarness();
    await screen.findByRole('textbox', { name: 'Nota clínica' });

    expect(screen.getByRole('button', { name: 'Cambiar paciente activo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Quitar paciente activo' })).toBeDisabled();
    expect(api.setClinicalActivePatient).not.toHaveBeenCalled();
  });

  it('keeps the context restore disabled while a review is pending', async () => {
    threadState.a = PATIENT_B;
    threadExtras.a = { actions: [PENDING_ACTION], pending_action: PENDING_ACTION };
    renderHarness();
    await screen.findByText('Evolución pendiente de revisión');
    act(() =>
      memoryRef.current?.setQueues((current) => ({
        ...current,
        a: [
          {
            id: 'q1',
            content: 'Para Ana',
            contextItems: [],
            patientId: PATIENT_A.id,
            patientName: 'Ana Pérez',
          },
        ],
      })),
    );

    expect(await screen.findByRole('button', { name: 'Volver a Ana Pérez' })).toBeDisabled();
  });

  it('keeps each thread unsent context separate across a thread switch', async () => {
    renderHarness();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nota clínica' }), {
      target: { value: 'Nota del hilo A' },
    });

    fireEvent.click(screen.getByRole('link', { name: 'Hilo B' }));
    expect(await screen.findByRole('textbox', { name: 'Consulta al asistente' })).toHaveValue('');
    fireEvent.change(screen.getByRole('textbox', { name: 'Consulta al asistente' }), {
      target: { value: 'Consulta del hilo B' },
    });

    fireEvent.click(screen.getByRole('link', { name: 'Hilo A' }));
    expect(await screen.findByRole('textbox', { name: 'Nota clínica' })).toHaveValue(
      'Nota del hilo A',
    );
  });

  it('keeps an unapplied artifact buffer when the workspace patient changes', async () => {
    threadExtras.a = { artifacts: [artifact()] };
    renderHarness();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Hallazgos' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Hallazgos' }), {
      target: { value: 'TEXTO SIN APLICAR' },
    });

    await choosePatient(/Bruno Ríos/);

    await waitFor(() =>
      expect(api.setClinicalActivePatient).toHaveBeenCalledWith('a', PATIENT_B.id),
    );
    expect(screen.getByRole('textbox', { name: 'Hallazgos' })).toHaveValue('TEXTO SIN APLICAR');
    expect(
      screen.queryByRole('alertdialog', { name: 'Trabajo sin enviar' }),
    ).not.toBeInTheDocument();
  });
});

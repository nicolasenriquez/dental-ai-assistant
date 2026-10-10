// Task 3.1 fail-first suite for F03 (historical patient identity belongs to the
// artifact). Red until task 3.2 passes artifact.patient through the runtime and
// renders it (labelling identity unavailable and blocking preparation when the
// owner-scoped read yields nothing) instead of substituting the workspace patient.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ClinicalDraft,
  ClinicalPatient,
  ClinicalPendingAction,
  ClinicalThread,
  ClinicalTurnArtifact,
} from '../../lib/api';
import * as api from '../../lib/api';
import { ClinicalRuntimeProvider, useOptionalClinicalRuntime } from '../ClinicalRuntimeProvider';
import { ClinicalAssistantArea } from './ClinicalAssistantArea';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    getClinicalThread: vi.fn(),
    getPatients: vi.fn(),
    getPatient: vi.fn(),
    updateClinicalArtifact: vi.fn(),
    streamClinicalTurn: vi.fn(),
    cancelClinicalTurn: vi.fn(),
  };
});

const DRAFT: ClinicalDraft = {
  context: 'Control preventivo.',
  findings: 'Sin hallazgos nuevos.',
  assessment: 'Salud periodontal estable.',
  treatment: 'Mantener higiene.',
  follow_up: 'Control en seis meses.',
  review_flags: [],
};

const RAW_RUT_A = '11.111.111-1';
const patientA: ClinicalPatient = {
  id: 'patient-a',
  first_name: 'Ana',
  last_name: 'Histórica',
  rut_masked: '11.111.•••-1',
};
const patientB: ClinicalPatient = {
  id: 'patient-b',
  first_name: 'Bruno',
  last_name: 'Actual',
  rut_masked: '22.222.•••-2',
};

function withRawRut(patient: ClinicalPatient): ClinicalPatient {
  // The API must never expose a raw RUT here; the synthetic field proves the UI drops it.
  return { ...patient, rut: RAW_RUT_A } as ClinicalPatient;
}

function artifact(
  id: string,
  patient: ClinicalPatient,
  overrides: Partial<ClinicalTurnArtifact> = {},
): ClinicalTurnArtifact {
  return {
    id,
    owner_user_id: 'owner',
    thread_id: 'thread-a',
    turn_id: `turn-${id}`,
    patient_id: patient.id,
    artifact_type: 'clinical_draft',
    status: 'draft',
    source_note: 'Nota clínica original',
    generated_draft: DRAFT,
    draft: DRAFT,
    evolution_at: '2026-09-10T12:00:00Z',
    created_at: '2026-09-10T12:00:00Z',
    updated_at: '2026-09-10T12:00:00Z',
    patient,
    ...overrides,
  };
}

function pendingAction(
  status: ClinicalPendingAction['status'],
  overrides: Partial<ClinicalPendingAction> = {},
): ClinicalPendingAction {
  return {
    id: 'action-1',
    thread_id: 'thread-a',
    turn_id: 'turn-artifact-a',
    artifact_id: 'artifact-a',
    patient_id: patientA.id,
    action_type: 'save_evolution',
    proposal_payload: {
      evolution_id: 'evolution-1',
      patient_id: patientA.id,
      evolution_at: '2026-09-10T12:00:00Z',
      raw_note: 'Nota clínica original',
      generated_text: 'Evolución clínica',
      final_text: 'Evolución clínica',
    },
    proposal_hash: 'a'.repeat(64),
    status,
    expires_at: '2026-09-10T13:00:00Z',
    created_at: '2026-09-10T12:00:00Z',
    resolved_at: null,
    result_resource_id: null,
    ...overrides,
  };
}

function thread(
  activePatient: ClinicalPatient | null,
  artifacts: ClinicalTurnArtifact[] = [],
  actions: ClinicalPendingAction[] = [],
): ClinicalThread {
  return {
    id: 'thread-a',
    owner_user_id: 'owner',
    title: 'Hilo A',
    active_patient: activePatient,
    pending_action_patient: null,
    active_turn_id: null,
    created_at: '2026-09-10T12:00:00Z',
    updated_at: '2026-09-10T12:00:00Z',
    messages: [],
    artifacts,
    pending_action: null,
    actions,
  };
}

function AreaRoute(): JSX.Element | null {
  const { threadId } = useParams<{ threadId: string }>();
  const shared = useOptionalClinicalRuntime();
  if (!threadId || !shared) return null;
  return <ClinicalAssistantArea threadId={threadId} assistant={shared.controller} />;
}

function SendProbe(): JSX.Element {
  const shared = useOptionalClinicalRuntime();
  return (
    <button type="button" onClick={() => void shared?.controller.send('Nota de prueba')}>
      Enviar turno de prueba
    </button>
  );
}

function renderHarness() {
  return render(
    <MemoryRouter initialEntries={['/a/thread-a']}>
      <ClinicalRuntimeProvider>
        <Routes>
          <Route path="/a/:threadId" element={<AreaRoute />} />
        </Routes>
        <SendProbe />
      </ClinicalRuntimeProvider>
    </MemoryRouter>,
  );
}

function artifactEl(container: HTMLElement, id: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-artifact-id="${id}"]`);
  if (!element) throw new Error(`artifact ${id} is not rendered`);
  return element;
}

function liveArtifactFrame(threadId: string, turnId: string, itemId: string, patientId: string) {
  return {
    schema_version: 1,
    event_id: `event-${itemId}`,
    sequence: 1,
    thread_id: threadId,
    turn_id: turnId,
    item_id: itemId,
    item_type: 'clinical_draft',
    status: 'completed',
    data: {
      thread_id: threadId,
      turn_id: turnId,
      item_id: itemId,
      item_type: 'clinical_draft',
      status: 'completed',
      draft: DRAFT,
      generated_draft: DRAFT,
      source_note: 'Nota clínica original',
      patient_id: patientId,
      evolution_at: '2026-09-10T12:00:00Z',
    },
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeAll(() => {
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.mocked(api.getPatients).mockResolvedValue([]);
  vi.mocked(api.getClinicalThread).mockResolvedValue(thread(patientA));
});

describe('clinical artifact historical identity', () => {
  it.each<[string, ClinicalPatient | null]>([
    ['the same patient', patientA],
    ['another patient', patientB],
    ['no patient', null],
  ])(
    'hydrated artifact keeps its own patient when the workspace has %s',
    async (_label, activePatient) => {
      vi.mocked(api.getClinicalThread).mockResolvedValue(
        thread(activePatient, [artifact('artifact-a', withRawRut(patientA))]),
      );
      const view = renderHarness();
      const element = await waitFor(() => artifactEl(view.container, 'artifact-a'));

      expect(within(element).getByText('Ana Histórica')).toBeVisible();
      expect(within(element).getByText('11.111.•••-1')).toBeVisible();
      expect(within(element).queryByText(RAW_RUT_A)).toBeNull();
      if (activePatient?.id !== patientA.id) {
        expect(within(element).queryByText('Bruno Actual')).toBeNull();
      }
    },
  );

  it('renders each attempt with its own patient when the workspace is cleared', async () => {
    vi.mocked(api.getClinicalThread).mockResolvedValue(
      thread(null, [artifact('artifact-a', patientA), artifact('artifact-b', patientB)]),
    );
    const view = renderHarness();
    const first = await waitFor(() => artifactEl(view.container, 'artifact-a'));
    const second = artifactEl(view.container, 'artifact-b');

    expect(within(first).getByText('Ana Histórica')).toBeVisible();
    expect(within(second).getByText('Bruno Actual')).toBeVisible();
    expect(within(first).queryByText('Bruno Actual')).toBeNull();
    expect(within(second).queryByText('Ana Histórica')).toBeNull();
  });

  it('labels missing historical metadata and blocks preparation instead of using the active patient', async () => {
    vi.mocked(api.getClinicalThread).mockResolvedValue(
      thread(patientA, [artifact('artifact-a', patientA, { patient: null })]),
    );
    const view = renderHarness();
    const element = await waitFor(() => artifactEl(view.container, 'artifact-a'));

    expect(within(element).getByText('Información del paciente no disponible')).toBeVisible();
    expect(within(element).queryByText('Ana Histórica')).toBeNull();
    expect(within(element).getByRole('button', { name: 'Revisar y guardar' })).toBeDisabled();
  });

  it('does not borrow the active patient for a live artifact whose owner-scoped read fails', async () => {
    vi.mocked(api.getPatient).mockRejectedValue(new api.ApiError(404, { detail: 'not found' }));
    vi.mocked(api.getPatients).mockResolvedValue([]);
    vi.mocked(api.getClinicalThread).mockResolvedValue(thread(patientA, []));
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    let turnId = '';
    vi.mocked(api.streamClinicalTurn).mockImplementation((_id, request) => {
      turnId = request.turn_id;
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              streamController = controller;
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
      );
    });
    const view = renderHarness();
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar turno de prueba' }));
    await waitFor(() => expect(api.streamClinicalTurn).toHaveBeenCalledTimes(1));

    await act(async () => {
      streamController.enqueue(
        new TextEncoder().encode(
          `event: item.completed\ndata: ${JSON.stringify(
            liveArtifactFrame('thread-a', turnId, 'artifact-live', patientA.id),
          )}\n\n`,
        ),
      );
    });
    const element = await waitFor(() => artifactEl(view.container, 'artifact-live'));

    expect(within(element).getByText('Información del paciente no disponible')).toBeVisible();
    expect(within(element).queryByText('Ana Histórica')).toBeNull();
    expect(within(element).getByRole('button', { name: 'Revisar y guardar' })).toBeDisabled();
  });

  it('resolves a live artifact missing metadata from the owner-scoped read', async () => {
    vi.mocked(api.getPatients).mockResolvedValue([{ ...patientA, last_evolution_at: null }]);
    vi.mocked(api.getClinicalThread).mockResolvedValue(thread(patientB, []));
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    let turnId = '';
    vi.mocked(api.streamClinicalTurn).mockImplementation((_id, request) => {
      turnId = request.turn_id;
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              streamController = controller;
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
      );
    });
    const view = renderHarness();
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar turno de prueba' }));
    await waitFor(() => expect(api.streamClinicalTurn).toHaveBeenCalledTimes(1));

    await act(async () => {
      streamController.enqueue(
        new TextEncoder().encode(
          `event: item.completed\ndata: ${JSON.stringify(
            liveArtifactFrame('thread-a', turnId, 'artifact-live', patientA.id),
          )}\n\n`,
        ),
      );
    });
    const element = await waitFor(() => artifactEl(view.container, 'artifact-live'));

    await waitFor(() => expect(within(element).getByText('Ana Histórica')).toBeVisible());
    expect(within(element).getByText('11.111.•••-1')).toBeVisible();
    expect(within(element).queryByText('Bruno Actual')).toBeNull();
  });

  it.each<[string, Partial<ClinicalTurnArtifact>, Partial<ClinicalPendingAction>]>([
    ['review', { status: 'pending' }, { status: 'pending' }],
    ['saved', { status: 'approved' }, { status: 'approved', result_resource_id: 'evolution-1' }],
  ])(
    '%s stage retains its historical patient when the workspace selects another patient',
    async (_stage, artifactOverrides, actionOverrides) => {
      vi.mocked(api.getClinicalThread).mockResolvedValue(
        thread(
          patientB,
          [artifact('artifact-a', patientA, artifactOverrides)],
          [pendingAction(actionOverrides.status ?? 'pending', actionOverrides)],
        ),
      );
      const view = renderHarness();
      const element = await waitFor(() => artifactEl(view.container, 'artifact-a'));

      expect(within(element).getByText('Ana Histórica')).toBeVisible();
      expect(within(element).getByText('11.111.•••-1')).toBeVisible();
      expect(within(element).queryByText('Bruno Actual')).toBeNull();
    },
  );
});

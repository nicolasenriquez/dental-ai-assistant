// Task 6.1 fail-first suite for F06 (recovery presentation and transport
// reconciliation). Red until task 6.2 adds the typed recovery client and the
// controller/UI path: reconcile before retry, explicit draft recovery for
// failed/expired actions, verification when the authoritative read is
// unavailable, effective-action selection, fresh approval after recovery and
// saved-with-Drive separation. Real ClinicalRuntimeProvider +
// ClinicalAssistantArea/controller; only the typed api functions are mocked.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ClinicalDraft,
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
    updateClinicalArtifact: vi.fn(),
    prepareClinicalSave: vi.fn(),
    resolveClinicalAction: vi.fn(),
    cancelClinicalTurn: vi.fn(),
    recoverClinicalDraft: vi.fn(),
    retryClinicalDriveExport: vi.fn(),
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

const PATIENT = { id: 'p1', first_name: 'Ana', last_name: 'Pérez', rut_masked: '••••' };
const HASH = 'a'.repeat(64);

function recoverClient() {
  return vi.mocked(api.recoverClinicalDraft);
}

function artifact(overrides: Partial<ClinicalTurnArtifact> = {}): ClinicalTurnArtifact {
  return {
    id: 'artifact-1',
    owner_user_id: 'owner',
    thread_id: 'a',
    turn_id: 'turn-1',
    patient_id: 'p1',
    artifact_type: 'clinical_draft',
    status: 'draft',
    source_note: 'Nota clínica original',
    generated_draft: DRAFT,
    draft: DRAFT,
    evolution_at: '2026-09-10T12:00:00Z',
    created_at: '2026-09-10T12:00:00Z',
    updated_at: '2026-09-10T12:00:00Z',
    ...overrides,
  };
}

function action(
  status: ClinicalPendingAction['status'],
  overrides: Partial<ClinicalPendingAction> = {},
): ClinicalPendingAction {
  return {
    id: 'action-1',
    thread_id: 'a',
    turn_id: 'turn-1',
    artifact_id: 'artifact-1',
    patient_id: 'p1',
    action_type: 'save_evolution',
    proposal_payload: null,
    proposal_hash: HASH,
    status,
    expires_at: '2026-09-10T13:00:00Z',
    created_at: '2026-09-10T12:00:00Z',
    resolved_at: status === 'pending' ? null : '2026-09-10T12:30:00Z',
    result_resource_id: null,
    ...overrides,
  };
}

function thread(overrides: Partial<ClinicalThread> = {}): ClinicalThread {
  return {
    id: 'a',
    owner_user_id: 'owner',
    title: 'Hilo A',
    active_patient: PATIENT,
    pending_action_patient: null,
    active_turn_id: null,
    created_at: '2026-09-10T12:00:00Z',
    updated_at: '2026-09-10T12:00:00Z',
    messages: [],
    artifacts: [],
    pending_action: null,
    actions: [],
    ...overrides,
  };
}

function AreaRoute(): JSX.Element | null {
  const { threadId } = useParams<{ threadId: string }>();
  const shared = useOptionalClinicalRuntime();
  if (!threadId || !shared) return null;
  return <ClinicalAssistantArea threadId={threadId} assistant={shared.controller} />;
}

function renderHarness() {
  return render(
    <MemoryRouter initialEntries={['/a/a']}>
      <ClinicalRuntimeProvider>
        <Routes>
          <Route path="/a/:threadId" element={<AreaRoute />} />
        </Routes>
      </ClinicalRuntimeProvider>
    </MemoryRouter>,
  );
}

async function confirmSave(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar guardado' }));
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Guardar evolución' })).getByRole('button', {
      name: 'Guardar evolución',
    }),
  );
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.mocked(api.getPatients).mockResolvedValue([]);
  vi.mocked(api.updateClinicalArtifact).mockResolvedValue(artifact());
  vi.mocked(api.prepareClinicalSave).mockResolvedValue({ ...action('pending'), patient: PATIENT });
  recoverClient().mockResolvedValue({
    outcome: 'recovered',
    thread_id: 'a',
    artifact_id: 'artifact-1',
  });
});

describe('assistant approval recovery presentation', () => {
  it('offers explicit draft recovery after a failed save and delegates the canonical action', async () => {
    let current = thread({
      artifacts: [artifact({ status: 'pending' })],
      actions: [action('pending')],
    });
    vi.mocked(api.getClinicalThread).mockImplementation(async () => current);
    const failedArtifact = artifact({ status: 'failed' });
    vi.mocked(api.resolveClinicalAction).mockImplementation(async () => {
      current = thread({ artifacts: [failedArtifact], actions: [action('failed')] });
      throw new api.ApiError(502, { detail: { code: 'EVOLUTION_SAVE_FAILED' } });
    });

    renderHarness();
    await confirmSave();

    const recover = await screen.findByRole('button', { name: 'Recuperar borrador' });
    fireEvent.click(recover);

    await waitFor(() =>
      expect(recoverClient()).toHaveBeenCalledWith('action-1', {
        proposal_hash: HASH,
        expected_artifact_updated_at: failedArtifact.updated_at,
      }),
    );
  });

  it('reconciles a lost save response to the canonical saved identity without recovery', async () => {
    let current = thread({
      artifacts: [artifact({ status: 'pending' })],
      actions: [action('pending')],
    });
    vi.mocked(api.getClinicalThread).mockImplementation(async () => current);
    vi.mocked(api.resolveClinicalAction).mockImplementation(async () => {
      current = thread({
        artifacts: [artifact({ status: 'approved' })],
        actions: [action('approved', { result_resource_id: 'evolution-1' })],
      });
      throw new Error('network');
    });

    renderHarness();
    await confirmSave();

    expect(await screen.findByText(/Guardada/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Recuperar borrador' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar guardado' })).not.toBeInTheDocument();
  });

  it('keeps verification available and blocks clinical writes when the read is unavailable', async () => {
    let reads = 0;
    vi.mocked(api.getClinicalThread).mockImplementation(async () => {
      reads += 1;
      if (reads === 1)
        return thread({
          artifacts: [artifact({ status: 'pending' })],
          actions: [action('pending')],
        });
      throw new Error('unavailable');
    });
    vi.mocked(api.resolveClinicalAction).mockRejectedValue(
      new api.ApiError(502, { detail: { code: 'EVOLUTION_SAVE_FAILED' } }),
    );

    renderHarness();
    await confirmSave();

    expect(await screen.findByRole('button', { name: 'Verificar estado' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Recuperar borrador' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revisar y guardar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar guardado' })).not.toBeInTheDocument();
  });

  it('hydrates the recovered draft, preserves the old action and prepares a fresh approval', async () => {
    let current = thread({
      artifacts: [artifact({ status: 'failed' })],
      actions: [action('failed')],
    });
    vi.mocked(api.getClinicalThread).mockImplementation(async () => current);
    recoverClient().mockImplementation(async () => {
      current = thread({
        artifacts: [artifact({ status: 'draft', patient: PATIENT })],
        actions: [action('failed')],
      });
      return { outcome: 'recovered', thread_id: 'a', artifact_id: 'artifact-1' };
    });
    vi.mocked(api.prepareClinicalSave).mockResolvedValue({
      ...action('pending', { id: 'action-2' }),
      patient: PATIENT,
    });

    renderHarness();
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar borrador' }));

    expect(await screen.findByRole('button', { name: 'Revisar y guardar' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Recuperar borrador' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revisar y guardar' }));

    expect(await screen.findByRole('button', { name: 'Confirmar guardado' })).toBeVisible();
    expect(api.prepareClinicalSave).toHaveBeenCalledWith('a', {
      turn_id: 'turn-1',
      artifact_id: 'artifact-1',
    });
  });

  it('keeps a declined action closed without recovery or verification', async () => {
    vi.mocked(api.getClinicalThread).mockResolvedValue(
      thread({ artifacts: [artifact({ status: 'declined' })], actions: [action('declined')] }),
    );

    renderHarness();

    expect(await screen.findByText('Descartada')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Recuperar borrador' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verificar estado' })).not.toBeInTheDocument();
  });

  it('keeps a pending action in the existing review flow without recovery', async () => {
    vi.mocked(api.getClinicalThread).mockResolvedValue(
      thread({ artifacts: [artifact({ status: 'pending' })], actions: [action('pending')] }),
    );

    renderHarness();

    expect(await screen.findByRole('button', { name: 'Confirmar guardado' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Recuperar borrador' })).not.toBeInTheDocument();
  });

  it.each([
    ['failed', 'DRIVE_WRITE_FAILED', 'Reintentar'],
    ['unknown', undefined, 'Verificar'],
  ] as const)(
    'keeps the saved stage with a %s Drive export and no clinical recovery',
    async (status, errorCode, actionName) => {
      vi.mocked(api.getClinicalThread).mockResolvedValue(
        thread({
          artifacts: [artifact({ status: 'approved' })],
          actions: [
            action('approved', {
              result_resource_id: 'evolution-1',
              drive_export: { status, error_code: errorCode },
            }),
          ],
        }),
      );

      renderHarness();

      expect(await screen.findByText(/Guardada/)).toBeVisible();
      expect(screen.getByRole('button', { name: actionName })).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Recuperar borrador' })).not.toBeInTheDocument();
    },
  );

  it('treats a missing recovery endpoint as unavailable without a direct-save fallback', async () => {
    vi.mocked(api.getClinicalThread).mockResolvedValue(
      thread({ artifacts: [artifact({ status: 'failed' })], actions: [action('failed')] }),
    );
    vi.mocked(api.recoverClinicalDraft).mockRejectedValue(
      new api.ApiError(404, { detail: 'Acción no encontrada' }),
    );

    renderHarness();
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar borrador' }));

    expect(
      await screen.findByText('No pudimos recuperar el borrador. Actualiza la conversación.'),
    ).toBeVisible();
    expect(api.resolveClinicalAction).not.toHaveBeenCalled();
    expect(screen.getByText('Sin hallazgos nuevos.')).toBeVisible();
  });

  it('hydrates a draft recovered by another tab without a direct save', async () => {
    let current = thread({
      artifacts: [artifact({ status: 'failed' })],
      actions: [action('failed')],
    });
    vi.mocked(api.getClinicalThread).mockImplementation(async () => current);
    vi.mocked(api.recoverClinicalDraft).mockImplementation(async () => {
      current = thread({ artifacts: [artifact({ status: 'draft' })], actions: [action('failed')] });
      return { outcome: 'already_recovered', thread_id: 'a', artifact_id: 'artifact-1' };
    });

    renderHarness();
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar borrador' }));

    expect(await screen.findByRole('button', { name: 'Revisar y guardar' })).toBeVisible();
    expect(api.resolveClinicalAction).not.toHaveBeenCalled();
  });

  it('persists the recovered draft across a reload', async () => {
    let current = thread({
      artifacts: [artifact({ status: 'failed' })],
      actions: [action('failed')],
    });
    vi.mocked(api.getClinicalThread).mockImplementation(async () => current);
    vi.mocked(api.recoverClinicalDraft).mockImplementation(async () => {
      current = thread({ artifacts: [artifact({ status: 'draft' })], actions: [action('failed')] });
      return { outcome: 'recovered', thread_id: 'a', artifact_id: 'artifact-1' };
    });

    const view = renderHarness();
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar borrador' }));
    await screen.findByRole('button', { name: 'Revisar y guardar' });

    view.unmount();
    renderHarness();

    expect(await screen.findByRole('button', { name: 'Revisar y guardar' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Recuperar borrador' })).not.toBeInTheDocument();
  });
});

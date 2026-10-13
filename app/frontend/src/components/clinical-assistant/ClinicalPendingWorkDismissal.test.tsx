import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { PatientOverview } from '../patients/PatientOverview';
import { ClinicalPendingWork } from './ClinicalPendingWork';

afterEach(() => vi.restoreAllMocks());

const patient = (name: string) => ({ id: 'p', display_name: name, rut_masked: '•••' });

const draftContent: api.ClinicalDraft = {
  context: 'Control preventivo',
  findings: 'Sin hallazgos nuevos',
  assessment: 'Estable',
  treatment: 'Mantener higiene',
  follow_up: 'Control en seis meses',
  review_flags: [],
};

function draft(id: string, name: string): api.PendingWorkItem {
  return {
    id,
    kind: 'recoverable_draft',
    patient: patient(name),
    updated_at: '2026-10-01T12:00:00Z',
    action: { kind: 'continue_draft', artifact_id: 'artifact-a', thread_id: 't' },
    summary: `Borrador ${id}`,
  };
}

function approval(id: string, actionId: string, name: string): api.PendingWorkItem {
  return {
    id,
    kind: 'approval_required',
    patient: patient(name),
    updated_at: '2026-10-01T12:00:00Z',
    action: { kind: 'review_approval', action_id: actionId, thread_id: 't' },
    summary: `Revisión ${id}`,
  };
}

const pageOf = (
  items: api.PendingWorkItem[],
  total: number,
  next_cursor: string | null,
): api.PendingWorkPage => ({ items, total, next_cursor });

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function artifact(overrides: Partial<api.ClinicalTurnArtifact> = {}): api.ClinicalTurnArtifact {
  return {
    id: 'artifact-a',
    owner_user_id: 'u',
    thread_id: 't',
    turn_id: 'turn-1',
    patient_id: 'p',
    artifact_type: 'clinical_draft',
    status: 'draft',
    source_note: 'Nota original',
    generated_draft: draftContent,
    draft: draftContent,
    evolution_at: '2026-10-01T12:00:00.123456Z',
    created_at: '2026-10-01T11:00:00.000000Z',
    updated_at: '2026-10-01T12:00:00.123456Z',
    ...overrides,
  };
}

function pendingAction(
  id: string,
  overrides: Partial<api.ClinicalPendingAction> = {},
): api.ClinicalPendingAction {
  return {
    id,
    thread_id: 't',
    turn_id: 'turn-1',
    artifact_id: 'artifact-a',
    patient_id: 'p',
    action_type: 'save_evolution',
    proposal_payload: null,
    proposal_hash: 'a'.repeat(64),
    status: 'pending',
    expires_at: '2026-10-01T13:00:00Z',
    created_at: '2026-10-01T12:00:00Z',
    resolved_at: null,
    ...overrides,
  };
}

function threadOf(overrides: Partial<api.ClinicalThread> = {}): api.ClinicalThread {
  return {
    id: 't',
    owner_user_id: 'u',
    title: 'Asistente',
    active_patient: null,
    pending_action_patient: null,
    active_turn_id: null,
    created_at: '2026-10-01T11:00:00Z',
    updated_at: '2026-10-01T12:00:00Z',
    messages: [],
    artifacts: [],
    pending_action: null,
    actions: [],
    ...overrides,
  };
}

const receipt = (operationId: string): api.ClinicalDiscardReceipt => ({
  outcome: 'discarded',
  thread_id: 't',
  patient_id: 'p',
  artifact_id: 'artifact-a',
  artifact_status: 'discarded',
  operation_id: operationId,
  discarded_by: 'u',
  resolved_at: '2026-10-01T12:05:00Z',
  expected_artifact_updated_at: '2026-10-01T12:00:00.123456Z',
  updated_at: '2026-10-01T12:05:00Z',
});

const renderList = (element = <ClinicalPendingWork />) =>
  render(<MemoryRouter>{element}</MemoryRouter>);

it('declines an approval only after a read-only canonical match and confirmed consequences', async () => {
  const query = vi
    .spyOn(api, 'getClinicalPendingWork')
    .mockResolvedValueOnce(pageOf([approval('review:a', 'action-1', 'Ana Pérez')], 1, null))
    .mockResolvedValue({ items: [], total: 0, next_cursor: null });
  const read = vi.spyOn(api, 'getClinicalThread').mockResolvedValue(
    threadOf({
      artifacts: [artifact({ status: 'pending' })],
      actions: [pendingAction('action-1')],
    }),
  );
  const decline = vi
    .spyOn(api, 'resolveClinicalAction')
    .mockResolvedValue(pendingAction('action-1', { status: 'declined' }));
  renderList();
  const trigger = await screen.findByRole('button', { name: 'Descartar' });
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('alertdialog');
  expect(read).toHaveBeenCalledWith('t', { readOnly: true });
  expect(decline).not.toHaveBeenCalled();
  expect(within(dialog).getByText(/Ana Pérez/)).toBeVisible();
  expect(within(dialog).getByText(/no se modifican/)).toBeVisible();
  expect(within(dialog).getByRole('button', { name: 'Descartar' })).toHaveClass(
    'clinical-danger-button',
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Descartar' }));
  await waitFor(() => expect(decline).toHaveBeenCalledTimes(1));
  expect(decline).toHaveBeenCalledWith('action-1', 'decline', 'a'.repeat(64), {
    expected_patient_id: 'p',
    expected_thread_id: 't',
    expected_artifact_id: 'artifact-a',
    expected_artifact_updated_at: '2026-10-01T12:00:00.123456Z',
  });
  await waitFor(() => expect(screen.queryByText('Revisión review:a')).not.toBeInTheDocument());
  expect(query).toHaveBeenCalledTimes(2);
});

it('cancels the confirmation without a write and returns focus to the trigger', async () => {
  vi.spyOn(api, 'getClinicalPendingWork').mockResolvedValue(
    pageOf([approval('review:a', 'action-1', 'Ana Pérez')], 1, null),
  );
  vi.spyOn(api, 'getClinicalThread').mockResolvedValue(
    threadOf({
      artifacts: [artifact({ status: 'pending' })],
      actions: [pendingAction('action-1')],
    }),
  );
  const decline = vi.spyOn(api, 'resolveClinicalAction');
  renderList();
  const trigger = await screen.findByRole('button', { name: 'Descartar' });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Mantener' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(decline).not.toHaveBeenCalled();
  await waitFor(() => expect(trigger).toHaveFocus());
});

it('retains one discard operation across an uncertain retry', async () => {
  const query = vi
    .spyOn(api, 'getClinicalPendingWork')
    .mockResolvedValueOnce(pageOf([draft('draft:a', 'Ana Pérez')], 1, null))
    .mockResolvedValue({ items: [], total: 0, next_cursor: null });
  vi.spyOn(api, 'getClinicalThread')
    .mockResolvedValueOnce(threadOf({ artifacts: [artifact()] }))
    .mockResolvedValueOnce(threadOf({ artifacts: [artifact()] }));
  const discard = vi
    .spyOn(api, 'discardClinicalArtifact')
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementation(async (_thread, _artifact, body) => receipt(body.operation_id));
  renderList();
  fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Descartar' }));
  expect(await screen.findByText('No pudimos confirmar si el descarte se completó.')).toBeVisible();
  expect(discard).toHaveBeenCalledTimes(1);
  const operationId = discard.mock.calls[0][2].operation_id;
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(discard).toHaveBeenCalledTimes(2));
  expect(discard.mock.calls[1][2].operation_id).toBe(operationId);
  await waitFor(() => expect(screen.queryByText('Borrador draft:a')).not.toBeInTheDocument());
  expect(query).toHaveBeenCalledTimes(2);
});

it('reports a definitive conflict from a retry and returns to a fresh intent', async () => {
  vi.spyOn(api, 'getClinicalPendingWork').mockResolvedValue(
    pageOf([draft('draft:a', 'Ana Pérez')], 1, null),
  );
  vi.spyOn(api, 'getClinicalThread')
    .mockResolvedValueOnce(threadOf({ artifacts: [artifact()] }))
    .mockResolvedValueOnce(threadOf({ artifacts: [artifact()] }));
  const discard = vi
    .spyOn(api, 'discardClinicalArtifact')
    .mockRejectedValueOnce(new Error('offline'))
    .mockRejectedValueOnce(new api.ApiError(409, { detail: { code: 'CLINICAL_DISCARD_STALE' } }));
  renderList();
  fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Descartar' }),
  );
  await screen.findByText('No pudimos confirmar si el descarte se completó.');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'El trabajo cambió desde que lo leíste',
  );
  expect(screen.getByRole('button', { name: 'Descartar' })).toBeVisible();
  expect(
    screen.queryByText('No pudimos confirmar si el descarte se completó.'),
  ).not.toBeInTheDocument();
  expect(discard).toHaveBeenCalledTimes(2);
});

it('confirms a lost discard through the stored receipt without a second write', async () => {
  vi.spyOn(api, 'getClinicalPendingWork')
    .mockResolvedValueOnce(pageOf([draft('draft:a', 'Ana Pérez')], 1, null))
    .mockResolvedValue({ items: [], total: 0, next_cursor: null });
  const discard = vi
    .spyOn(api, 'discardClinicalArtifact')
    .mockRejectedValueOnce(new Error('offline'));
  let reads = 0;
  vi.spyOn(api, 'getClinicalThread').mockImplementation(async () => {
    reads += 1;
    if (reads === 1) return threadOf({ artifacts: [artifact()] });
    return threadOf({
      artifacts: [
        artifact({
          status: 'discarded',
          discard_operation_id: discard.mock.calls[0][2].operation_id,
        }),
      ],
    });
  });
  renderList();
  fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Descartar' }),
  );
  await screen.findByText('No pudimos confirmar si el descarte se completó.');
  fireEvent.click(screen.getByRole('button', { name: 'Verificar estado' }));
  await waitFor(() => expect(screen.queryByText('Borrador draft:a')).not.toBeInTheDocument());
  expect(discard).toHaveBeenCalledTimes(1);
  expect(reads).toBe(2);
});

it('reports a saved approval from another actor without declining', async () => {
  vi.spyOn(api, 'getClinicalPendingWork')
    .mockResolvedValueOnce(pageOf([approval('review:a', 'action-1', 'Ana Pérez')], 1, null))
    .mockResolvedValue({ items: [], total: 0, next_cursor: null });
  const decline = vi
    .spyOn(api, 'resolveClinicalAction')
    .mockRejectedValueOnce(new Error('offline'));
  let reads = 0;
  vi.spyOn(api, 'getClinicalThread').mockImplementation(async () => {
    reads += 1;
    return reads === 1
      ? threadOf({
          artifacts: [artifact({ status: 'pending' })],
          actions: [pendingAction('action-1')],
        })
      : threadOf({
          artifacts: [artifact({ status: 'approved' })],
          actions: [pendingAction('action-1', { status: 'approved', result_resource_id: 'e-1' })],
        });
  });
  renderList();
  fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Descartar' }),
  );
  await screen.findByText('No pudimos confirmar si el descarte se completó.');
  fireEvent.click(screen.getByRole('button', { name: 'Verificar estado' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Otra persona aprobó esta evolución');
  expect(decline).toHaveBeenCalledTimes(1);
});

it('keeps the last complete window when the post-dismissal refresh fails', async () => {
  const query = vi
    .spyOn(api, 'getClinicalPendingWork')
    .mockResolvedValueOnce(pageOf([draft('draft:a', 'Ana Pérez')], 1, null))
    .mockRejectedValueOnce(new Error('offline'));
  vi.spyOn(api, 'getClinicalThread').mockResolvedValue(threadOf({ artifacts: [artifact()] }));
  const discard = vi
    .spyOn(api, 'discardClinicalArtifact')
    .mockImplementation(async (_thread, _artifact, body) => receipt(body.operation_id));
  renderList();
  fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Descartar' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar tus pendientes.');
  expect(screen.getByText('Borrador draft:a')).toBeVisible();
  expect(discard).toHaveBeenCalledTimes(1);
  expect(query).toHaveBeenCalledTimes(2);
});

it('ignores a canonical read that resolves after the patient scope changed', async () => {
  vi.spyOn(api, 'getClinicalPendingWork').mockResolvedValue(
    pageOf([draft('draft:a', 'Ana Pérez')], 1, null),
  );
  const read = deferred<api.ClinicalThread>();
  vi.spyOn(api, 'getClinicalThread').mockReturnValue(read.promise);
  const decline = vi.spyOn(api, 'resolveClinicalAction');
  const discard = vi.spyOn(api, 'discardClinicalArtifact');
  const view = renderList(<ClinicalPendingWork patientId="p" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
  view.rerender(
    <MemoryRouter>
      <ClinicalPendingWork patientId="q" />
    </MemoryRouter>,
  );
  await act(async () => {
    read.resolve(threadOf({ artifacts: [artifact()] }));
  });
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(decline).not.toHaveBeenCalled();
  expect(discard).not.toHaveBeenCalled();
});

it('opens the inline patient-scoped pending list and returns focus to Ver pendientes on close', async () => {
  vi.spyOn(api, 'getClinicalPendingWork').mockImplementation(async (_patient, _cursor, options) => {
    const kind = options?.kind ?? 'approval_required';
    return {
      total: 1,
      next_cursor: null,
      items: [
        {
          id: kind,
          kind,
          patient: { id: 'patient', display_name: 'Ana Pérez', rut_masked: '••.•••.941-5' },
          updated_at: '2026-10-05T12:00:00Z',
          action:
            kind === 'drive_export_failed'
              ? { kind: 'retry_drive_export', evolution_id: 'saved-evolution', thread_id: null }
              : kind === 'approval_required'
                ? { kind: 'review_approval', action_id: 'approval', thread_id: 'review-thread' }
                : { kind: 'continue_draft', artifact_id: 'draft', thread_id: 'draft-thread' },
        },
      ],
    } as api.PendingWorkPage;
  });
  render(
    <MemoryRouter>
      <PatientOverview patientId="patient" evolutions={[]} onAssistant={vi.fn()} />
    </MemoryRouter>,
  );
  const triggers = await screen.findAllByRole('button', { name: 'Ver pendientes' });
  expect(triggers).toHaveLength(3);
  fireEvent.click(triggers[0]);
  const region = await screen.findByRole('region', { name: 'Trabajo pendiente' });
  expect(within(region).getByText('1 pendiente')).toBeVisible();
  expect(within(region).getByRole('link', { name: 'Revisar' })).toHaveAttribute(
    'href',
    '/a/review-thread#approval=approval',
  );
  expect(api.getClinicalPendingWork).toHaveBeenLastCalledWith('patient', undefined, {
    kind: 'approval_required',
    limit: undefined,
  });
  fireEvent.click(within(region).getByRole('button', { name: 'Cerrar' }));
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'Trabajo pendiente' })).not.toBeInTheDocument(),
  );
  expect(triggers[0]).toHaveFocus();
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ClinicalApprovalItem, ClinicalDraftItem } from '../../hooks/useClinicalAssistant';
import type { ClinicalDraft, ClinicalPatient, ClinicalPendingAction } from '../../lib/api';
import { ClinicalEvolutionArtifact } from './ClinicalEvolutionArtifact';

const patient: ClinicalPatient = {
  id: 'patient-1',
  first_name: 'Ana',
  last_name: 'Pérez',
  rut_masked: '12.345.•••-6',
};
const draft: ClinicalDraft = {
  context: 'Control preventivo',
  findings: 'Sin hallazgos nuevos',
  assessment: 'Salud periodontal estable',
  treatment: 'Mantener higiene',
  follow_up: 'Control en seis meses',
  review_flags: [],
};

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
});
afterEach(cleanup);

function draftItem(overrides: Partial<ClinicalDraftItem> = {}): ClinicalDraftItem {
  return {
    id: 'artifact-1',
    turnId: 'turn-1',
    status: 'completed',
    createdAt: '2026-09-10T12:00:00Z',
    type: 'draft',
    artifactStatus: 'draft',
    draft,
    baseline: draft,
    sourceNote: 'Nota clínica original',
    edited: false,
    stale: false,
    patientId: patient.id,
    evolutionAt: '2026-09-10T12:00:00Z',
    ...overrides,
  };
}

function approvalItem(status: ClinicalApprovalItem['status'], resource: string | null = null) {
  const actionStatus: ClinicalPendingAction['status'] =
    status === 'pending' || status === 'running'
      ? 'pending'
      : status === 'completed'
        ? 'approved'
        : status === 'declined'
          ? 'declined'
          : 'failed';
  return {
    id: 'approval-1',
    turnId: 'turn-1',
    status,
    createdAt: '2026-09-10T12:00:00Z',
    type: 'approval' as const,
    action: {
      id: 'approval-1',
      thread_id: 'thread-1',
      turn_id: 'turn-1',
      artifact_id: 'artifact-1',
      patient_id: patient.id,
      action_type: 'save_evolution',
      proposal_payload: null,
      proposal_hash: 'a'.repeat(64),
      status: actionStatus,
      expires_at: '2026-09-10T13:00:00Z',
      created_at: '2026-09-10T12:00:00Z',
      resolved_at: null,
      result_resource_id: resource,
    },
    patient,
  } as ClinicalApprovalItem;
}

function renderArtifact(
  item: ClinicalDraftItem,
  approval?: ClinicalApprovalItem,
  onPrepare = vi.fn(),
  onSaveToDrive?: () => void,
) {
  return render(
    <MemoryRouter>
      <ClinicalEvolutionArtifact
        item={item}
        approval={approval}
        onChange={vi.fn()}
        onSourceChange={vi.fn().mockResolvedValue(true)}
        onEvolutionAtChange={vi.fn()}
        onRegenerate={vi.fn()}
        onPrepare={onPrepare}
        onResolve={vi.fn()}
        onBackToEdit={vi.fn()}
        onSaveToDrive={onSaveToDrive}
      />
    </MemoryRouter>,
  );
}

describe('ClinicalEvolutionArtifact', () => {
  it('renders draft lifecycle with one review action and overflow utilities', () => {
    const onPrepare = vi.fn();
    renderArtifact(draftItem(), undefined, onPrepare, vi.fn());

    expect(screen.getByText('Borrador')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Revisar y guardar' })).toBeVisible();
    expect(screen.getByText('Más acciones')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Confirmar guardado' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revisar y guardar' }));
    expect(onPrepare).toHaveBeenCalledOnce();
  });

  it('renders review actions and keeps confirmation in the native dialog', () => {
    const onSaveToDrive = vi.fn();
    const view = renderArtifact(
      draftItem({ status: 'pending', artifactStatus: 'pending' }),
      approvalItem('pending'),
      undefined,
      onSaveToDrive,
    );

    expect(view.container.querySelector('[data-clinical-stage="review"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar guardado' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Seguir editando' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Guardar en Drive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revisar y guardar' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar guardado' }));
    expect(screen.getByRole('dialog', { name: 'Guardar evolución' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Volver a editar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Guardar evolución' })).toBeVisible();
  });

  it('shows one inline saving spinner and removes artifact actions', () => {
    const view = renderArtifact(
      draftItem({ status: 'running', artifactStatus: 'pending' }),
      approvalItem('running'),
    );
    const artifact = view.container.querySelector('[data-clinical-stage="saving"]');

    expect(artifact).toBeInTheDocument();
    expect(artifact).toHaveTextContent('Guardando…');
    expect(artifact?.querySelectorAll('.animate-spin')).toHaveLength(1);
    expect(screen.queryByText('Más acciones')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar guardado' })).not.toBeInTheDocument();
  });

  it('keeps saved state quiet with resource and Drive as secondary action', () => {
    const onSaveToDrive = vi.fn();
    const view = renderArtifact(
      draftItem({ artifactStatus: 'approved' }),
      approvalItem('completed', 'evolution-1'),
      undefined,
      onSaveToDrive,
    );
    const artifact = view.container.querySelector('[data-artifact-id="artifact-1"]');

    expect(artifact).toHaveTextContent('Guardada');
    expect(screen.getByRole('link', { name: /Ver en ficha/ })).toHaveAttribute(
      'href',
      '/patients/patient-1/evolutions/evolution-1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar en Drive' }));
    expect(onSaveToDrive).toHaveBeenCalledOnce();
    expect(screen.queryByText('Evolución guardada')).not.toBeInTheDocument();
  });
});

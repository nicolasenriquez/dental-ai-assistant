import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ClinicalResultItem } from '../../hooks/clinicalRuntime';
import type {
  ClinicalApprovalItem,
  ClinicalDraftItem,
  ClinicalTranscriptItem,
} from '../../hooks/useClinicalAssistant';
import type { ClinicalDraft, ClinicalPatient, ClinicalPendingAction } from '../../lib/api';
import { ClinicalTranscript } from './ClinicalTranscript';

const base = { turnId: 'turn-1', createdAt: '2026-09-10T12:00:00Z' };
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
const callbacks = {
  onDraftChange: vi.fn(),
  onDraftSourceChange: vi.fn(),
  onDraftDateChange: vi.fn(),
  onDraftRegenerate: vi.fn(),
  onPrepare: vi.fn(),
  onResolve: vi.fn(),
  onBackToEdit: vi.fn(),
  onRetry: vi.fn(),
};

function draftItem(overrides: Partial<ClinicalDraftItem> = {}): ClinicalDraftItem {
  return {
    ...base,
    id: 'artifact-1',
    status: 'completed',
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

function approvalItem(
  status: ClinicalApprovalItem['status'],
  resultResourceId: string | null = null,
): ClinicalApprovalItem {
  const actionStatus: ClinicalPendingAction['status'] =
    status === 'pending' || status === 'running'
      ? 'pending'
      : status === 'completed'
        ? 'approved'
        : status === 'declined'
          ? 'declined'
          : 'failed';
  return {
    ...base,
    id: 'approval-1',
    status,
    type: 'approval',
    action: {
      id: 'approval-1',
      thread_id: 'thread-1',
      turn_id: base.turnId,
      artifact_id: 'artifact-1',
      patient_id: patient.id,
      action_type: 'save_evolution',
      proposal_hash: 'a'.repeat(64),
      status: actionStatus,
      expires_at: '2026-09-10T13:00:00Z',
      created_at: base.createdAt,
      resolved_at: status === 'completed' ? '2026-09-10T12:05:00Z' : null,
      result_resource_id: resultResourceId,
      proposal_payload: {
        evolution_id: 'evolution-1',
        patient_id: patient.id,
        evolution_at: '2026-09-10T12:00:00Z',
        raw_note: 'Nota clínica original',
        generated_text: 'Borrador generado',
        final_text: 'Evolución final',
      },
      patient,
    },
    patient,
  };
}

function resultItem(): ClinicalResultItem {
  return {
    ...base,
    id: 'result-1',
    status: 'completed',
    type: 'result',
    actionId: 'approval-1',
    message: 'Evolución guardada',
    evolutionId: 'evolution-1',
    patientId: patient.id,
  };
}

beforeAll(() => {
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
});
afterEach(cleanup);

function renderTranscript(items: ClinicalTranscriptItem[], busy = true, threadId = 'thread-1') {
  return render(
    <MemoryRouter>
      <ClinicalTranscript threadId={threadId} items={items} busy={busy} {...callbacks} />
    </MemoryRouter>,
  );
}

function getArtifact(container: HTMLElement): HTMLElement {
  const artifacts = container.querySelectorAll<HTMLElement>('[data-artifact-id="artifact-1"]');
  expect(artifacts).toHaveLength(1);
  return artifacts[0] as HTMLElement;
}

function expectNoPeerCards(container: HTMLElement): void {
  expect(
    container.querySelectorAll(
      '.clinical-approval-prompt, .clinical-approval-terminal, .clinical-receipt, .clinical-result',
    ),
  ).toHaveLength(0);
}

describe('ClinicalTranscript', () => {
  it('shows thinking only while a busy user item is latest', () => {
    const user: ClinicalTranscriptItem = {
      ...base,
      id: 'user-1',
      type: 'user',
      status: 'completed',
      content: 'Control preventivo',
    };
    const view = renderTranscript([user]);
    expect(
      screen.getByRole('status', { name: 'El asistente está preparando una respuesta' }),
    ).toHaveTextContent('Pensando…');

    view.rerender(
      <MemoryRouter>
        <ClinicalTranscript
          threadId="thread-1"
          items={[
            user,
            {
              ...base,
              id: 'activity-1',
              type: 'activity',
              status: 'running',
              label: 'Analizando exactamente',
            },
          ]}
          busy
          {...callbacks}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Pensando…')).not.toBeInTheDocument();
    expect(screen.getByText('Analizando exactamente')).toBeVisible();
  });

  it('does not show thinking when idle', () => {
    renderTranscript(
      [{ ...base, id: 'user-1', type: 'user', status: 'completed', content: 'Control' }],
      false,
    );
    expect(screen.queryByText('Pensando…')).not.toBeInTheDocument();
  });

  it.each([
    ['pending', 'clinical-activity--active'],
    ['running', 'clinical-activity--active'],
    ['completed', 'clinical-activity--completed'],
    ['failed', 'clinical-activity--failed'],
    ['declined', 'clinical-activity--declined'],
  ] as const)('maps %s activity status without changing its label', (status, className) => {
    renderTranscript([
      { ...base, id: `activity-${status}`, type: 'activity', status, label: 'pensando literal' },
    ]);
    expect(screen.getByRole('status')).toHaveClass(className);
    expect(screen.getByText('pensando literal')).toBeVisible();
  });

  it('keeps one stable artifact through lifecycle, hydration, navigation, and back-to-edit', () => {
    const view = renderTranscript([draftItem()], false);
    const artifact = getArtifact(view.container);
    expect(artifact).toHaveTextContent('Borrador');

    const reviewItems = [
      draftItem({ status: 'pending', artifactStatus: 'pending' }),
      approvalItem('pending'),
    ];
    view.rerender(
      <MemoryRouter>
        <ClinicalTranscript threadId="thread-1" items={reviewItems} busy={false} {...callbacks} />
      </MemoryRouter>,
    );
    expect(getArtifact(view.container)).toBe(artifact);
    expect(artifact).toHaveTextContent('Revisión');
    expectNoPeerCards(view.container);

    const savingItems = [
      draftItem({ status: 'running', artifactStatus: 'pending' }),
      approvalItem('running'),
    ];
    view.rerender(
      <MemoryRouter>
        <ClinicalTranscript threadId="thread-1" items={savingItems} busy={false} {...callbacks} />
      </MemoryRouter>,
    );
    expect(getArtifact(view.container)).toBe(artifact);
    expect(artifact).toHaveTextContent('Guardando…');
    expectNoPeerCards(view.container);

    const savedItems = [
      draftItem({ artifactStatus: 'approved' }),
      approvalItem('completed', 'evolution-1'),
      resultItem(),
    ];
    view.rerender(
      <MemoryRouter>
        <ClinicalTranscript threadId="thread-1" items={savedItems} busy={false} {...callbacks} />
      </MemoryRouter>,
    );
    expect(getArtifact(view.container)).toBe(artifact);
    expect(artifact).toHaveTextContent('Guardada');
    expectNoPeerCards(view.container);

    const hydratedItems = savedItems.map((item) => ({ ...item }));
    view.rerender(
      <MemoryRouter>
        <ClinicalTranscript threadId="thread-1" items={hydratedItems} busy={false} {...callbacks} />
      </MemoryRouter>,
    );
    expect(getArtifact(view.container)).toBe(artifact);
    expectNoPeerCards(view.container);

    view.rerender(
      <MemoryRouter>
        <ClinicalTranscript threadId="thread-2" items={[]} busy={false} {...callbacks} />
      </MemoryRouter>,
    );
    view.rerender(
      <MemoryRouter>
        <ClinicalTranscript threadId="thread-1" items={savedItems} busy={false} {...callbacks} />
      </MemoryRouter>,
    );
    const restoredArtifact = getArtifact(view.container);
    expect(restoredArtifact).toHaveAttribute('data-artifact-id', 'artifact-1');
    expect(restoredArtifact).toHaveTextContent('Guardada');
    expectNoPeerCards(view.container);

    const editItems = [draftItem()];
    view.rerender(
      <MemoryRouter>
        <ClinicalTranscript threadId="thread-1" items={editItems} busy={false} {...callbacks} />
      </MemoryRouter>,
    );
    expect(getArtifact(view.container)).toBe(restoredArtifact);
    expect(restoredArtifact).toHaveTextContent('Borrador');
    expectNoPeerCards(view.container);
  });

  it('does not invent Drive fields when no export state is present', () => {
    const view = renderTranscript(
      [draftItem({ artifactStatus: 'approved' }), approvalItem('completed', 'evolution-1')],
      false,
    );
    const artifact = getArtifact(view.container);

    expect(artifact).not.toHaveTextContent(/Drive|sincroniz/i);
    expect(artifact.querySelector('[data-drive-export]')).not.toBeInTheDocument();
  });

  it('keeps native approval dialog inside the stable artifact', () => {
    const view = renderTranscript(
      [draftItem({ status: 'pending', artifactStatus: 'pending' }), approvalItem('pending')],
      false,
    );
    const artifact = getArtifact(view.container);

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar guardado' }));

    expect(screen.getByRole('dialog', { name: 'Guardar evolución' })).toBeVisible();
    expect(getArtifact(view.container)).toBe(artifact);
  });
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ClinicalApprovalItem } from '../../hooks/useClinicalAssistant';
import { ApprovalRequestItem } from './ApprovalRequestItem';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
});
afterEach(cleanup);

function item(
  status: ClinicalApprovalItem['status'],
  resource: string | null = null,
): ClinicalApprovalItem {
  return {
    id: 'approval-1',
    turnId: 'turn-1',
    type: 'approval',
    status,
    createdAt: '2026-09-10T12:00:00Z',
    patient: {
      id: 'patient-1',
      first_name: 'Ana',
      last_name: 'Pérez',
      rut_masked: '12.345.•••-6',
      birth_date: '1990-01-01',
    },
    action: {
      id: 'action-1',
      thread_id: 'thread-1',
      turn_id: 'turn-1',
      artifact_id: 'draft-1',
      patient_id: 'patient-1',
      action_type: 'save_evolution',
      proposal_hash: 'hash',
      status,
      expires_at: '2026-09-10T13:00:00Z',
      created_at: '2026-09-10T12:00:00Z',
      resolved_at: null,
      result_resource_id: resource,
      proposal_payload: { evolution_at: '2026-09-10T12:00:00Z' },
    },
  } as ClinicalApprovalItem;
}

function renderItem(
  status: ClinicalApprovalItem['status'],
  resource: string | null = null,
  autoOpen = false,
) {
  return render(
    <MemoryRouter>
      <ApprovalRequestItem item={item(status, resource)} onResolve={vi.fn()} autoOpen={autoOpen} />
    </MemoryRouter>,
  );
}

describe('ApprovalRequestItem', () => {
  it('preserves the pending prompt and modal actions', () => {
    renderItem('pending');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('dialog', { name: 'Confirmar guardado' })).toBeVisible();
    expect(screen.getByText('Requiere confirmación')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Volver a editar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Guardar evolución' })).toBeEnabled();
  });

  it('keeps one saving spinner and disables both actions', () => {
    const view = renderItem('pending', null, true);
    view.rerender(
      <MemoryRouter>
        <ApprovalRequestItem item={item('running')} onResolve={vi.fn()} autoOpen />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Confirmar guardado' });
    expect(dialog).toHaveTextContent('Guardando');
    expect(dialog.querySelectorAll('.animate-spin')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Volver a editar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  });

  it.each([
    ['declined', 'Descartada', 'No se realizaron cambios.'],
    ['failed', 'No disponible', 'Esta confirmación expiró o ya no puede recuperarse.'],
  ] as const)('renders %s as a terminal state', (status, badge, copy) => {
    renderItem(status);
    expect(screen.getByText(badge)).toBeVisible();
    expect(screen.getByText(copy)).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('links a completed approval with a resource', () => {
    renderItem('completed', 'evolution-1');
    expect(screen.getByRole('link', { name: /Ver en ficha/ })).toHaveAttribute(
      'href',
      '/patients/patient-1/evolutions/evolution-1',
    );
  });

  it('does not build a route when a completed approval has no resource', () => {
    renderItem('completed');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Guardada')).toBeVisible();
  });
});

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
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
  callbacks: { onRecoverDraft?: () => void; onVerify?: () => void } = {},
) {
  return render(
    <MemoryRouter>
      <ApprovalRequestItem
        item={item(status, resource)}
        onResolve={vi.fn()}
        onBackToEdit={vi.fn()}
        onRecoverDraft={callbacks.onRecoverDraft}
        onVerify={callbacks.onVerify}
        autoOpen={autoOpen}
      />
    </MemoryRouter>,
  );
}

describe('ApprovalRequestItem', () => {
  it('shows the exact prepared content and patient before explicit approval', () => {
    const approval = item('pending');
    approval.action.proposal_payload = {
      evolution_id: 'e',
      patient_id: 'patient-1',
      evolution_at: '2026-09-10T12:00:00Z',
      raw_note: 'Nota fuente',
      generated_text: 'Texto anterior',
      final_text: 'Versión revisada\nObservación clínica',
    };
    const onResolve = vi.fn();
    render(
      <ApprovalRequestItem
        item={approval}
        embedded
        reviewFlags={[{ source_text: 'Molestia ocasional', reason: 'Confirmar frecuencia.' }]}
        onResolve={onResolve}
        onBackToEdit={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar guardado' }));
    const dialog = screen.getByRole('dialog', { name: 'Guardar evolución' });
    expect(dialog).toHaveTextContent('Versión revisada');
    expect(dialog).toHaveTextContent('Observación clínica');
    expect(dialog).toHaveTextContent('Confirmar frecuencia.');
    expect(dialog).toHaveTextContent('12.345.•••-6');
    expect(dialog).not.toHaveTextContent('Texto anterior');
    expect(onResolve).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar evolución' }));
    expect(onResolve).toHaveBeenCalledWith('approve');
  });
  it('returns to editing without declining the action', () => {
    const onResolve = vi.fn();
    const onBackToEdit = vi.fn();
    render(
      <MemoryRouter>
        <ApprovalRequestItem
          item={item('pending')}
          onResolve={onResolve}
          onBackToEdit={onBackToEdit}
          autoOpen
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(onBackToEdit).toHaveBeenCalledOnce();
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('preserves the pending prompt and modal actions', () => {
    renderItem('pending');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('dialog', { name: 'Guardar evolución' })).toBeVisible();
    expect(screen.getByText('Requiere confirmación')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Seguir editando' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });

  it('keeps one saving spinner and disables both actions', () => {
    const view = renderItem('pending', null, true);
    view.rerender(
      <MemoryRouter>
        <ApprovalRequestItem
          item={item('running')}
          onResolve={vi.fn()}
          onBackToEdit={vi.fn()}
          autoOpen
        />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Guardar evolución' });
    expect(dialog).toHaveTextContent('Guardando');
    expect(dialog.querySelectorAll('.animate-spin')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Seguir editando' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  });

  it.each([['declined', 'Descartada', 'No se realizaron cambios.']] as const)(
    'renders %s as a closed terminal state',
    (status, badge, copy) => {
      renderItem(status);
      expect(screen.getByText(badge)).toBeVisible();
      expect(screen.getByText(copy)).toBeVisible();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    },
  );

  it('offers explicit draft recovery and verification for a failed action', () => {
    const onRecoverDraft = vi.fn();
    const onVerify = vi.fn();
    renderItem('failed', null, false, { onRecoverDraft, onVerify });
    expect(screen.getByText('No disponible')).toBeVisible();
    expect(
      screen.getByText('No pudimos guardar esta evolución. El borrador se conserva.'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar borrador' }));
    fireEvent.click(screen.getByRole('button', { name: 'Verificar estado' }));
    expect(onRecoverDraft).toHaveBeenCalledOnce();
    expect(onVerify).toHaveBeenCalledOnce();
  });

  it('keeps a failed action without recovery controls when no handler is provided', () => {
    renderItem('failed');
    expect(screen.getByText('No disponible')).toBeVisible();
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

describe('ApprovalRequestItem auto-open review controls', () => {
  function renderApproval(
    options: {
      status?: ClinicalApprovalItem['status'];
      autoOpen?: boolean;
      embedded?: boolean;
    } = {},
  ) {
    const onResolve = vi.fn();
    const onBackToEdit = vi.fn();
    const view = render(
      <MemoryRouter>
        <ApprovalRequestItem
          item={item(options.status ?? 'pending')}
          embedded={options.embedded ?? false}
          autoOpen={options.autoOpen ?? false}
          onResolve={onResolve}
          onBackToEdit={onBackToEdit}
        />
      </MemoryRouter>,
    );
    return { view, onResolve, onBackToEdit };
  }

  it('keeps a visible review trigger and returns focus after Escape, without resolving', () => {
    const { onResolve, onBackToEdit } = renderApproval({ autoOpen: true, embedded: true });
    const dialog = screen.getByRole('dialog', { name: 'Guardar evolución' });
    expect(dialog).toHaveAttribute('open');

    fireEvent(dialog, new Event('cancel'));

    const trigger = screen.getByRole('button', { name: 'Confirmar guardado' });
    expect(trigger).toBeVisible();
    expect(document.activeElement).toBe(trigger);
    expect(dialog).not.toHaveAttribute('open');
    expect(onResolve).not.toHaveBeenCalled();
    expect(onBackToEdit).not.toHaveBeenCalled();
  });

  it('closes through return-to-edit, keeps the trigger and never resolves implicitly', () => {
    const { onResolve, onBackToEdit } = renderApproval({ autoOpen: true, embedded: true });
    const dialog = screen.getByRole('dialog', { name: 'Guardar evolución' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Volver a editar' }));

    expect(onBackToEdit).toHaveBeenCalledOnce();
    expect(onResolve).not.toHaveBeenCalled();
    expect(dialog).not.toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Confirmar guardado' })).toBeVisible();
  });

  it('reopens the same dialog on demand and never renders a duplicate prompt', () => {
    renderApproval({ autoOpen: true, embedded: true });
    const dialog = screen.getByRole('dialog', { name: 'Guardar evolución' });
    const trigger = screen.getByRole('button', { name: 'Confirmar guardado' });

    fireEvent(dialog, new Event('cancel'));
    expect(dialog).not.toHaveAttribute('open');

    fireEvent.click(trigger);
    expect(dialog).toHaveAttribute('open');

    fireEvent(dialog, new Event('cancel'));
    fireEvent.click(trigger);
    expect(dialog).toHaveAttribute('open');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Confirmar guardado' })).toHaveLength(1);
  });

  it('does not reopen the auto-opened dialog after hydration remounts the artifact', () => {
    // Mirrors ClinicalAssistantArea: the parent owns the one-shot auto-open policy
    // and clears it once the artifact has consumed it, so a hydration remount cannot
    // replay the dialog while the permanent trigger stays available.
    function Harness() {
      const [autoOpen, setAutoOpen] = useState(true);
      const [generation, setGeneration] = useState(0);
      return (
        <MemoryRouter>
          <button type="button" onClick={() => setGeneration((value) => value + 1)}>
            Simular hidratación
          </button>
          <ApprovalRequestItem
            key={generation}
            item={item('pending')}
            embedded
            autoOpen={autoOpen}
            onAutoOpen={() => setAutoOpen(false)}
            onResolve={vi.fn()}
            onBackToEdit={vi.fn()}
          />
        </MemoryRouter>
      );
    }
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'Guardar evolución' });
    fireEvent(dialog, new Event('cancel'));
    expect(dialog).not.toHaveAttribute('open');

    fireEvent.click(screen.getByRole('button', { name: 'Simular hidratación' }));

    // A closed native dialog leaves the accessibility tree, so query the element.
    expect(document.querySelectorAll('dialog')).toHaveLength(1);
    expect(document.querySelector('dialog')).not.toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Confirmar guardado' })).toBeVisible();
  });

  it('keeps the committing dialog open and disabled, resisting Escape and implicit resolution', () => {
    const onResolve = vi.fn();
    const onBackToEdit = vi.fn();
    const view = render(
      <MemoryRouter>
        <ApprovalRequestItem
          item={item('pending')}
          autoOpen
          onResolve={onResolve}
          onBackToEdit={onBackToEdit}
        />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Guardar evolución' });

    view.rerender(
      <MemoryRouter>
        <ApprovalRequestItem
          item={item('running')}
          autoOpen
          onResolve={onResolve}
          onBackToEdit={onBackToEdit}
        />
      </MemoryRouter>,
    );

    expect(dialog).toHaveAttribute('open');
    fireEvent(dialog, new Event('cancel'));
    expect(dialog).toHaveAttribute('open');
    expect(within(dialog).getByRole('button', { name: 'Seguir editando' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    expect(onResolve).not.toHaveBeenCalled();
    expect(onBackToEdit).not.toHaveBeenCalled();
  });
});

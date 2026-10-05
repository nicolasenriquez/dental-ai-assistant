import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

function renderDialog(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  return render(
    <ConfirmDialog
      title="Confirmar acción"
      description="Esta acción requiere confirmación."
      confirmLabel="Confirmar"
      cancelLabel="Cancelar"
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      {...overrides}
    />,
  );
}

describe('ConfirmDialog', () => {
  it('focuses the safe action and cancels on Escape', () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });

    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls the selected action and disables both actions while busy', () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm, busy: true });

    expect(screen.getByRole('button', { name: 'Procesando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  });

  it('traps focus, invokes confirm, and restores the trigger focus on close', () => {
    const onConfirm = vi.fn();
    const trigger = document.createElement('button');
    trigger.textContent = 'Abrir';
    document.body.append(trigger);
    trigger.focus();
    const view = renderDialog({ onConfirm });

    const dialog = screen.getByRole('dialog');
    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    const confirm = screen.getByRole('button', { name: 'Confirmar' });
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(cancel).toHaveFocus();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();

    view.unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});

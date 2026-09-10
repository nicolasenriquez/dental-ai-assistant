import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceThreadList } from './WorkspaceThreadList';

const items = [
  {
    id: 'thread-1',
    title: 'Control de Ana',
    updatedAt: new Date().toISOString(),
    statusLabel: 'Pendiente de aprobación',
  },
];

function renderList(isCollapsed = false, onRequestExpand = vi.fn()) {
  return {
    onRequestExpand,
    ...render(
      <WorkspaceThreadList
        ariaLabel="Hilos del asistente clínico"
        title="Asistente"
        items={items}
        isCollapsed={isCollapsed}
        onRequestExpand={onRequestExpand}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
      />,
    ),
  };
}

describe('WorkspaceThreadList', () => {
  it('renders groups and thread rows when expanded', () => {
    renderList();

    expect(screen.getByRole('region', { name: 'Hoy' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Control de Ana · Pendiente de aprobación' }),
    ).toBeVisible();
  });

  it('keeps the collapsed rail to one history control and exposes pending approval text', () => {
    const onRequestExpand = vi.fn();
    renderList(true, onRequestExpand);

    expect(screen.queryByRole('button', { name: /Control de Ana/ })).not.toBeInTheDocument();
    const history = screen.getByRole('button', {
      name: 'Abrir historial de asistente; hay una aprobación pendiente',
    });
    expect(history).toBeVisible();
    fireEvent.click(history);
    expect(onRequestExpand).toHaveBeenCalledOnce();
  });

  it('uses the shared search affordance and clears its query', () => {
    const onQueryChange = vi.fn();
    render(
      <WorkspaceThreadList
        ariaLabel="Hilos del asistente clínico"
        title="Asistente"
        items={items}
        query="ana"
        onQueryChange={onQueryChange}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Buscar en asistente' }));
    expect(screen.getByRole('searchbox', { name: 'Buscar en asistente' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));

    expect(onQueryChange).toHaveBeenCalledWith('');
  });
});

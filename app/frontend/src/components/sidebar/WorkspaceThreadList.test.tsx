import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
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

function renderList(isCollapsed = false, onRequestExpand = vi.fn(), running = false) {
  return {
    onRequestExpand,
    ...render(
      <WorkspaceThreadList
        ariaLabel="Hilos del asistente clínico"
        title="Asistente"
        items={items}
        isCollapsed={isCollapsed}
        running={running}
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

  it('shows the mounted turn progress in the collapsed rail beside the pending dot', () => {
    renderList(true, vi.fn(), true);

    const history = screen.getByRole('button', {
      name: 'Abrir historial de asistente; respuesta en progreso; hay una aprobación pendiente',
    });
    expect(history.querySelector('.conversation-progress-indicator')).toBeInTheDocument();
    expect(history.querySelector('.workspace-thread-list__pending-dot.is-offset')).toBeVisible();
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

    const trigger = screen.getByRole('button', { name: 'Buscar en asistente' });
    fireEvent.click(trigger);

    const searchbox = screen.getByRole('searchbox', { name: 'Buscar en asistente' });
    expect(searchbox).toHaveFocus();

    fireEvent.keyDown(searchbox, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Buscar en asistente' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Buscar en asistente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));

    expect(onQueryChange).toHaveBeenCalledWith('');
  });

  it('expands the collapsed rail and focuses search with Ctrl+K', () => {
    function CollapsibleList() {
      const [collapsed, setCollapsed] = useState(true);
      return (
        <WorkspaceThreadList
          ariaLabel="Hilos del asistente clínico"
          title="Conversaciones"
          items={items}
          isCollapsed={collapsed}
          onRequestExpand={() => setCollapsed(false)}
          onQueryChange={vi.fn()}
          onCreate={vi.fn()}
          onSelect={vi.fn()}
        />
      );
    }
    render(<CollapsibleList />);
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('searchbox', { name: 'Buscar en conversaciones' })).toHaveFocus();
  });

  it('can hide the section title without losing search labels', () => {
    render(
      <WorkspaceThreadList
        ariaLabel="Hilos del asistente clínico"
        title="Conversaciones"
        items={items}
        showHeaderTitle={false}
        onQueryChange={vi.fn()}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByText('Conversaciones')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buscar en conversaciones' })).toBeVisible();
  });
});

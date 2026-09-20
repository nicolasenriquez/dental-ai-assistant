import { act, fireEvent, render, screen } from '@testing-library/react';
import { type KeyboardEventHandler, type RefObject, useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

vi.mock('./DriveBootstrapBanner', () => ({
  DriveBootstrapBanner: () => null,
}));

vi.mock('./Sidebar', () => ({
  Sidebar: ({
    sidebarRef,
    onKeyDown,
    isMobile,
    isOpen,
    isCollapsed,
    onToggleCollapse,
    onClose,
  }: {
    sidebarRef?: RefObject<HTMLElement>;
    onKeyDown?: KeyboardEventHandler<HTMLElement>;
    isMobile?: boolean;
    isOpen?: boolean;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
    onClose?: () => void;
  }) => (
    <aside
      id="app-sidebar"
      ref={sidebarRef}
      onKeyDown={onKeyDown}
      aria-hidden={isMobile && !isOpen ? true : undefined}
    >
      {isMobile && isOpen ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar navegación"
          aria-expanded="true"
          aria-controls="app-sidebar"
        />
      ) : !isMobile ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Abrir navegación' : 'Cerrar navegación'}
          aria-expanded={!isCollapsed}
          aria-controls="app-sidebar"
        />
      ) : null}
      <a href="/patients">Pacientes</a>
      <button type="button">Último elemento</button>
    </aside>
  ),
}));

function MountProbe({ onUnmount }: { onUnmount: () => void }) {
  useEffect(() => () => onUnmount(), [onUnmount]);
  return <main>Contenido</main>;
}

describe('AppShell mobile sidebar', () => {
  it('keeps workspace content mounted across responsive breakpoints', () => {
    let mobile = false;
    let compact = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        get matches() {
          return query.includes('767') ? mobile : compact;
        },
        addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
      })),
    );
    const onUnmount = vi.fn();

    render(
      <AppShell showConversations={false} workspaceMode>
        <MountProbe onUnmount={onUnmount} />
      </AppShell>,
    );

    mobile = true;
    compact = false;
    act(() => {
      for (const listener of listeners) listener();
    });

    expect(screen.getByText('Contenido')).toBeVisible();
    expect(onUnmount).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('renders the desktop workspace as a resizable accessory split', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );

    const { container } = render(
      <AppShell showConversations={false} workspaceMode workspaceAccessory={<aside>Drive</aside>}>
        <main>Contenido</main>
      </AppShell>,
    );

    expect(container.querySelector('.workspace-row')).toBeInTheDocument();
    expect(container.querySelector('.workspace-resize-handle')).toBeInTheDocument();
    expect(container.querySelector('.workspace-mobile-stack')).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('keeps the compact workspace in the stable split group', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('1024'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    const { container } = render(
      <AppShell showConversations={false} workspaceMode workspaceAccessory={<aside>Drive</aside>}>
        <main>Contenido</main>
      </AppShell>,
    );

    expect(container.querySelector('.workspace-row')).toBeInTheDocument();
    expect(container.querySelector('.workspace-resizable')).toBeInTheDocument();
    expect(container.querySelector('.workspace-resize-handle')).toBeInTheDocument();
    expect(container.querySelector('.workspace-mobile-stack')).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it.each([
    ['desktop', false],
    ['compact', true],
  ])('keeps main content mounted when the workspace accessory closes on %s', (_, isCompact) => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('1024') ? isCompact : false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const onUnmount = vi.fn();

    function Harness() {
      const [accessoryOpen, setAccessoryOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setAccessoryOpen((open) => !open)}>
            Alternar Drive
          </button>
          <AppShell
            showConversations={false}
            workspaceMode
            workspaceAccessory={accessoryOpen ? <aside>Drive</aside> : null}
          >
            <MountProbe onUnmount={onUnmount} />
          </AppShell>
        </>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Alternar Drive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Alternar Drive' }));

    expect(onUnmount).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('removes the closed mobile sidebar from accessibility navigation', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );

    const { container } = render(
      <AppShell showConversations={false}>
        <main>Contenido</main>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: 'Saltar al contenido principal' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(container.querySelector('#main-content')).toHaveAttribute('tabindex', '-1');

    const sidebar = container.querySelector('#app-sidebar');
    expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    expect(sidebar).toHaveAttribute('inert');

    vi.unstubAllGlobals();
  });

  it('manages aria state, focus and Escape', () => {
    render(
      <AppShell showConversations={false}>
        <main>Contenido</main>
      </AppShell>,
    );

    const trigger = screen.getByRole('button', { name: 'Abrir navegación' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);

    expect(screen.getByRole('button', { name: 'Cerrar navegación' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('link', { name: 'Pacientes' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('link', { name: 'Pacientes' }), { key: 'Escape' });

    expect(screen.getByRole('button', { name: 'Abrir navegación' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Abrir navegación' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('closes the sidebar from the visible toggle', () => {
    render(
      <AppShell showConversations={false}>
        <main>Contenido</main>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir navegación' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar navegación' }));

    expect(screen.getByRole('button', { name: 'Abrir navegación' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('keeps Tab navigation inside the open sidebar', () => {
    render(
      <AppShell showConversations={false}>
        <main>Contenido</main>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir navegación' }));
    const first = screen.getByRole('button', { name: 'Cerrar navegación' });
    const last = screen.getByRole('button', { name: 'Último elemento' });

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('collapses the sidebar from the persistent desktop toggle', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );

    render(
      <AppShell showConversations={false}>
        <main>Contenido</main>
      </AppShell>,
    );

    const trigger = screen.getByRole('button', { name: 'Cerrar navegación' });
    fireEvent.click(trigger);

    expect(screen.getByRole('button', { name: 'Abrir navegación' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(document.querySelector('#app-sidebar')).not.toHaveAttribute('aria-hidden');
    expect(document.querySelector('#app-sidebar')).not.toHaveAttribute('inert');

    vi.unstubAllGlobals();
  });
});

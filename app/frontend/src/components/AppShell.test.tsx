import { fireEvent, render, screen } from '@testing-library/react';
import type { KeyboardEventHandler, RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

vi.mock('./Sidebar', () => ({
  Sidebar: ({
    sidebarRef,
    onKeyDown,
    isMobile,
    isOpen,
  }: {
    sidebarRef?: RefObject<HTMLElement>;
    onKeyDown?: KeyboardEventHandler<HTMLElement>;
    isMobile?: boolean;
    isOpen?: boolean;
  }) => (
    <aside
      id="app-sidebar"
      ref={sidebarRef}
      onKeyDown={onKeyDown}
      aria-hidden={isMobile && !isOpen ? true : undefined}
    >
      <a href="/patients">Pacientes</a>
      <button type="button">Último elemento</button>
    </aside>
  ),
}));

describe('AppShell mobile sidebar', () => {
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

    fireEvent.keyDown(document, { key: 'Escape' });

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
    const first = screen.getByRole('link', { name: 'Pacientes' });
    const last = screen.getByRole('button', { name: 'Último elemento' });

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });
});

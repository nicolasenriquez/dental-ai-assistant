/**
 * Fail-first shell-seam tests for the Drive workspace (task 5.1).
 *
 * Seam for task 5.2 (design decision 23):
 *
 * - `AppShell` gains generic `utilities` (forwarded to `Sidebar`) and
 *   `workspaceAccessory` (rendered in the main area beside children on
 *   desktop). Neither imports Drive domain code. Assistant stays operable
 *   beside the accessory — no modal takeover on desktop.
 * - `Sidebar` renders `utilities` buttons independent of `showConversations`;
 *   Biblioteca is adapted through this seam for Chat without behavior change.
 *
 * Utility descriptor contract: `{ id: string; label: string; onActivate: () => void }`.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../components/AppShell';
import { Sidebar, type SidebarProps } from '../components/Sidebar';

interface UtilityDescriptor {
  id: string;
  label: string;
  onActivate: () => void;
}

vi.mock('../components/DriveBootstrapBanner', () => ({
  DriveBootstrapBanner: () => null,
}));

vi.mock('../components/VideoExplorer', () => ({
  VideoExplorer: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? (
      <div role="dialog" aria-label="Biblioteca de videos">
        abierta
      </div>
    ) : null,
}));

vi.mock('../hooks/useConversations', () => ({
  useConversations: vi.fn(() => ({
    conversations: [],
    loading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn(),
    filteredConversations: [],
  })),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    status: 'ready',
    user: null,
    error: null,
    signup: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    connectDrive: vi.fn(),
  })),
}));

vi.mock('../hooks/useToast', () => ({
  useToast: vi.fn(() => ({
    addToast: vi.fn(),
  })),
}));

type AppShellPropsSeam = Parameters<typeof AppShell>[0];

const driveUtility: UtilityDescriptor = {
  id: 'google-drive',
  label: 'Google Drive',
  onActivate: () => undefined,
};

const libraryUtility: UtilityDescriptor = {
  id: 'biblioteca',
  label: 'Biblioteca',
  onActivate: () => undefined,
};

describe('AppShell workspace accessory', () => {
  it('renders the workspace accessory beside the Assistant content without a backdrop', () => {
    render(
      <MemoryRouter>
        <AppShell
          {...({
            showConversations: false,
            workspaceAccessory: <div data-testid="drive-accessory">Espacio Drive</div>,
          } as unknown as AppShellPropsSeam)}
        >
          <main>Contenido clínico</main>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('drive-accessory')).toBeInTheDocument();
    expect(screen.getByText('Espacio Drive')).toBeInTheDocument();
    expect(screen.getByText('Contenido clínico')).toBeInTheDocument();
  });

  it('forwards generic utilities to the Sidebar without importing Drive code', () => {
    render(
      <MemoryRouter>
        <AppShell
          {...({
            showConversations: false,
            utilities: [libraryUtility, driveUtility],
          } as unknown as AppShellPropsSeam)}
        >
          <main>Contenido clínico</main>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Biblioteca' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Google Drive' })).toBeInTheDocument();
  });
});

describe('Sidebar utility seam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderSidebar(utilities: UtilityDescriptor[], showConversations = true) {
    const props = {
      isOpen: true,
      onClose: vi.fn(),
      showConversations,
      utilities,
    } as unknown as SidebarProps;
    return render(
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>,
    );
  }

  it('renders supplied utility buttons with their labels and activation callbacks', () => {
    const onActivate = vi.fn();
    renderSidebar([{ id: 'google-drive', label: 'Google Drive', onActivate }]);

    const button = screen.getByRole('button', { name: 'Google Drive' });
    fireEvent.click(button);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('keeps utility buttons available in the patient shell without conversations', () => {
    renderSidebar([driveUtility], false);

    expect(screen.getByRole('button', { name: 'Google Drive' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Biblioteca' })).not.toBeInTheDocument();
  });

  it('keeps Biblioteca behavior unchanged in the chat shell', () => {
    renderSidebar([driveUtility], true);

    expect(screen.getByRole('button', { name: 'Biblioteca' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Biblioteca de videos' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Biblioteca' }));
    expect(screen.getByRole('dialog', { name: 'Biblioteca de videos' })).toBeInTheDocument();
  });

  it('does not expose the video library in the patient shell without the seam', () => {
    renderSidebar([], false);

    expect(screen.queryByRole('button', { name: 'Biblioteca' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Biblioteca de videos' })).not.toBeInTheDocument();
  });
});

describe('AppShell keeps shell concerns generic', () => {
  it('accepts a mobile-width accessory without changing sidebar behavior', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );

    render(
      <MemoryRouter>
        <AppShell
          {...({
            showConversations: false,
            utilities: [driveUtility],
            workspaceAccessory: <div data-testid="drive-accessory">Espacio Drive</div>,
          } as unknown as AppShellPropsSeam)}
        >
          <main>Contenido clínico</main>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('drive-accessory')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Google Drive' })).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});

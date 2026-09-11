import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { Sidebar } from './Sidebar';

// Use vi.hoisted to ensure navigateMock is available when vi.mock runs (since vi.mock is hoisted)
const { navigateMock } = vi.hoisted(() => {
  return { navigateMock: vi.fn() };
});

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

// Mock the hooks
vi.mock('../hooks/useConversations', () => ({
  useConversations: vi.fn(() => ({
    conversations: [] as api.Conversation[],
    loading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn(),
    filteredConversations: [] as api.Conversation[],
  })),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    status: 'authed',
    user: {
      id: 'user-1',
      email: 'test@example.com',
      is_admin: false,
      messages_used_today: 5,
      messages_remaining_today: 20,
      rate_window_resets_at: null,
    },
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

afterEach(cleanup);

describe('Sidebar handleNewChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
  });

  describe('guard logic for empty conversations', () => {
    it('should reuse existing empty conversation instead of creating a duplicate', async () => {
      const emptyConversation = {
        id: 'conv-1',
        title: 'New Chat',
        preview: null, // null = no messages sent yet
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const { useConversations } = await import('../hooks/useConversations');
      vi.mocked(useConversations).mockReturnValueOnce({
        conversations: [emptyConversation] as api.Conversation[],
        loading: false,
        error: null,
        refetch: vi.fn(),
        rename: vi.fn(),
        filteredConversations: [emptyConversation] as api.Conversation[],
      });

      vi.spyOn(api, 'acquireConversation').mockResolvedValueOnce({
        conversation: emptyConversation,
        reused: true,
      });

      const onClose = vi.fn();
      const refetch = vi.fn();

      render(
        <MemoryRouter>
          <Sidebar
            activeConversationId="conv-1"
            isOpen={true}
            onClose={onClose}
            conversationsRef={{ current: refetch }}
          />
        </MemoryRouter>,
      );

      const newChatButton = screen.getByRole('button', { name: 'Nuevo chat' });

      await act(async () => {
        fireEvent.click(newChatButton);
      });

      expect(api.acquireConversation).toHaveBeenCalledTimes(1);
      // onClose should have been called
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should create new conversation when not on an empty conversation', async () => {
      const nonEmptyConversation = {
        id: 'conv-1',
        title: 'Existing Chat',
        preview: 'Hello world', // has a message preview
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const newConversation = {
        id: 'conv-2',
        title: 'New Chat',
        preview: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const { useConversations } = await import('../hooks/useConversations');
      vi.mocked(useConversations).mockReturnValueOnce({
        conversations: [nonEmptyConversation] as api.Conversation[],
        loading: false,
        error: null,
        refetch: vi.fn().mockResolvedValue(undefined),
        rename: vi.fn(),
        filteredConversations: [nonEmptyConversation] as api.Conversation[],
      });

      vi.spyOn(api, 'acquireConversation').mockResolvedValueOnce({
        conversation: newConversation,
        reused: false,
      });

      const onClose = vi.fn();
      const refetch = vi.fn();

      render(
        <MemoryRouter>
          <Sidebar
            activeConversationId="conv-1"
            isOpen={true}
            onClose={onClose}
            conversationsRef={{ current: refetch }}
          />
        </MemoryRouter>,
      );

      const newChatButton = screen.getByRole('button', { name: 'Nuevo chat' });

      await act(async () => {
        fireEvent.click(newChatButton);
        // Wait for async operations to complete
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(api.acquireConversation).toHaveBeenCalledTimes(1);
      // navigate should have been called
      expect(navigateMock).toHaveBeenCalledWith('/c/conv-2');
      // onClose should have been called
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should create new conversation when no active conversation', async () => {
      const { useConversations } = await import('../hooks/useConversations');
      vi.mocked(useConversations).mockReturnValueOnce({
        conversations: [] as api.Conversation[],
        loading: false,
        error: null,
        refetch: vi.fn().mockResolvedValue(undefined),
        rename: vi.fn(),
        filteredConversations: [] as api.Conversation[],
      });

      const newConversation = {
        id: 'conv-new',
        title: 'New Chat',
        preview: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      vi.spyOn(api, 'acquireConversation').mockResolvedValueOnce({
        conversation: newConversation,
        reused: false,
      });

      const onClose = vi.fn();
      const refetch = vi.fn();

      render(
        <MemoryRouter>
          <Sidebar
            activeConversationId={undefined}
            isOpen={true}
            onClose={onClose}
            conversationsRef={{ current: refetch }}
          />
        </MemoryRouter>,
      );

      const newChatButton = screen.getByRole('button', { name: 'Nuevo chat' });

      await act(async () => {
        fireEvent.click(newChatButton);
        // Wait for async operations to complete
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(api.acquireConversation).toHaveBeenCalledTimes(1);
      // navigate should have been called
      expect(navigateMock).toHaveBeenCalledWith('/c/conv-new');
      // onClose should have been called
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should handle createConversation error and show error message', async () => {
      const { useConversations } = await import('../hooks/useConversations');
      vi.mocked(useConversations).mockReturnValueOnce({
        conversations: [] as api.Conversation[],
        loading: false,
        error: null,
        refetch: vi.fn().mockResolvedValue(undefined),
        rename: vi.fn(),
        filteredConversations: [] as api.Conversation[],
      });

      vi.spyOn(api, 'acquireConversation').mockRejectedValueOnce(new Error('Network error'));

      const onClose = vi.fn();
      const refetch = vi.fn();

      render(
        <MemoryRouter>
          <Sidebar
            activeConversationId={undefined}
            isOpen={true}
            onClose={onClose}
            conversationsRef={{ current: refetch }}
          />
        </MemoryRouter>,
      );

      const newChatButton = screen.getByRole('button', { name: 'Nuevo chat' });

      await act(async () => {
        fireEvent.click(newChatButton);
      });

      // Should show error message
      expect(
        await screen.findByText('No pudimos abrir una conversación. Intenta nuevamente.'),
      ).toBeInTheDocument();
    });
  });
});

describe('Sidebar logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
  });

  it('shows the user email and a logout button when authed', async () => {
    render(
      <MemoryRouter>
        <Sidebar activeConversationId={undefined} isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    const userMenuTrigger = screen.getByRole('button', { name: /abrir menú de usuario/i });
    fireEvent.click(userMenuTrigger);
    const logoutItem = screen.getByRole('menuitem', { name: /cerrar sesión/i });
    expect(logoutItem).toBeInTheDocument();
    expect(logoutItem).toHaveFocus();
  });

  it('calls logout and navigates to /login when the button is clicked', async () => {
    const logoutMock = vi.fn().mockResolvedValue(undefined);
    const { useAuth } = await import('../hooks/useAuth');
    vi.mocked(useAuth).mockReturnValue({
      status: 'ready',
      user: {
        id: 'user-1',
        email: 'test@example.com',
        is_admin: false,
        messages_used_today: 5,
        messages_remaining_today: 20,
        rate_window_resets_at: null,
      } as never,
      error: null,
      authConfig: null,
      signup: vi.fn(),
      login: vi.fn(),
      loginWithGoogle: vi.fn(),
      logout: logoutMock,
      refresh: vi.fn(),
      connectDrive: vi.fn(),
    });

    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <Sidebar activeConversationId={undefined} isOpen={true} onClose={onClose} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /abrir menú de usuario/i }));
    const logoutBtn = screen.getByRole('menuitem', { name: /cerrar sesión/i });
    await act(async () => {
      fireEvent.click(logoutBtn);
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/login');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Sidebar patient shell', () => {
  it('does not expose the video library outside the chat shell', () => {
    render(
      <MemoryRouter>
        <Sidebar
          activeConversationId={undefined}
          isOpen={true}
          onClose={vi.fn()}
          showConversations={false}
        />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole('button', { name: 'Explorar biblioteca de videos' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Biblioteca de videos' })).not.toBeInTheDocument();
  });
});

describe('Sidebar navigation and conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
  });

  it('groups conversations into Hoy, Ayer and Anteriores without previews', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T15:00:00'));
    const { useConversations } = await import('../hooks/useConversations');
    vi.mocked(useConversations).mockReturnValueOnce({
      conversations: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
      rename: vi.fn(),
      filteredConversations: [
        {
          id: 'today',
          title: 'Consulta de hoy',
          preview: 'No debe aparecer en la fila',
          created_at: '2026-09-05T10:00:00Z',
          updated_at: '2026-09-05T10:00:00Z',
        },
        {
          id: 'yesterday',
          title: 'Consulta de ayer',
          preview: 'Preview de ayer',
          created_at: '2026-09-04T10:00:00Z',
          updated_at: '2026-09-04T10:00:00Z',
        },
        {
          id: 'older',
          title: 'Consulta anterior',
          preview: 'Preview anterior',
          created_at: '2026-08-01T10:00:00Z',
          updated_at: '2026-08-01T10:00:00Z',
        },
      ] as api.Conversation[],
    });

    render(
      <MemoryRouter>
        <Sidebar isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('region', { name: 'Hoy' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ayer' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Anteriores' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Consulta de hoy' })).toBeInTheDocument();
    expect(screen.queryByText('No debe aparecer en la fila')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('opens a contextual menu and supports rename and delete actions', async () => {
    const rename = vi.fn().mockResolvedValue({ ok: true });
    const { useConversations } = await import('../hooks/useConversations');
    vi.mocked(useConversations).mockReturnValueOnce({
      conversations: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
      rename,
      filteredConversations: [
        {
          id: 'conv-1',
          title: 'Consulta contextual',
          preview: 'Tiene mensajes',
          created_at: '2026-09-05T10:00:00Z',
          updated_at: '2026-09-05T10:00:00Z',
        },
      ] as api.Conversation[],
    });

    render(
      <MemoryRouter>
        <Sidebar isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /acciones para consulta contextual/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Renombrar' })).toHaveFocus();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Renombrar' }));
    const input = screen.getByRole('textbox', { name: 'Renombrar conversación' });
    fireEvent.change(input, { target: { value: 'Consulta renombrada' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(rename).toHaveBeenCalledWith('conv-1', 'Consulta renombrada'));

    fireEvent.click(screen.getByRole('button', { name: /acciones para consulta contextual/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
    expect(screen.getByRole('dialog', { name: '¿Eliminar conversación?' })).toBeInTheDocument();
  });

  it('shows administration only for admin users', async () => {
    const { useAuth } = await import('../hooks/useAuth');
    vi.mocked(useAuth).mockReturnValueOnce({
      status: 'ready',
      user: {
        id: 'admin-1',
        email: 'admin@example.com',
        is_admin: true,
        messages_used_today: 5,
        messages_remaining_today: 20,
        rate_window_resets_at: null,
      },
      error: null,
      authConfig: null,
      signup: vi.fn(),
      login: vi.fn(),
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
      connectDrive: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Sidebar isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /abrir menú de usuario/i }));
    expect(screen.getByRole('menuitem', { name: 'Administración' })).toHaveAttribute(
      'href',
      '/admin',
    );
  });

  it('shows the progress indicator only for the in-progress conversation', async () => {
    const { useConversations } = await import('../hooks/useConversations');
    vi.mocked(useConversations).mockReturnValueOnce({
      conversations: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
      rename: vi.fn(),
      filteredConversations: [
        {
          id: 'in-progress',
          title: 'Respuesta en curso',
          preview: 'Tiene mensajes',
          created_at: '2026-09-05T10:00:00Z',
          updated_at: '2026-09-05T10:00:00Z',
        },
        {
          id: 'idle',
          title: 'Conversación pausada',
          preview: 'Tiene mensajes',
          created_at: '2026-09-05T09:00:00Z',
          updated_at: '2026-09-05T09:00:00Z',
        },
      ] as api.Conversation[],
    });

    render(
      <MemoryRouter>
        <Sidebar
          isOpen={true}
          onClose={vi.fn()}
          runtimeByConversationId={{
            'in-progress': {
              status: 'running',
              content: '',
              sources: [],
              streamingStatus: null,
              error: null,
              failedMessage: null,
              canRetry: false,
            },
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status', { name: 'Respuesta en progreso' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Respuesta en curso$/ })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Conversación pausada' })).toHaveAttribute(
      'aria-busy',
      'false',
    );
  });

  it('exposes the quota progress bar and the keyboard search shortcut', () => {
    render(
      <MemoryRouter>
        <Sidebar isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('progressbar', { name: 'Cuota de mensajes diaria' })).toHaveAttribute(
      'aria-valuenow',
      '5',
    );
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('searchbox', { name: 'Buscar conversaciones' })).toHaveFocus();
  });

  it('does not capture the search shortcut while the mobile drawer is closed', () => {
    render(
      <MemoryRouter>
        <Sidebar isOpen={false} isMobile={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(
      screen.queryByRole('searchbox', { name: 'Buscar conversaciones' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the collapsed 56px rail accessible and functional', () => {
    const { container } = render(
      <MemoryRouter>
        <Sidebar isOpen={true} isCollapsed={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    const sidebar = container.querySelector('#app-sidebar');
    expect(sidebar).toHaveClass('collapsed');
    expect(sidebar).not.toHaveAttribute('aria-hidden');
    expect(screen.getByRole('button', { name: 'Expandir navegación' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Expandir navegación' })).toHaveAttribute(
      'aria-controls',
      'app-sidebar',
    );
    expect(screen.getByRole('link', { name: 'Pacientes' })).toHaveAttribute('title', 'Pacientes');
    expect(screen.getByRole('link', { name: 'Chat' })).toHaveAttribute('title', 'Chat');
    expect(screen.getByRole('button', { name: 'Buscar conversaciones' })).toHaveAttribute(
      'title',
      'Buscar conversaciones (Ctrl K)',
    );
  });

  it('keeps the compact rail free of workspace list chrome', async () => {
    const { useConversations } = await import('../hooks/useConversations');
    const conversations = [
      {
        id: 'compact-chat',
        title: 'Compact chat',
        preview: 'A message',
        created_at: '2026-01-15T10:00:00Z',
        updated_at: '2026-01-15T10:00:00Z',
      },
    ] as api.Conversation[];

    vi.mocked(useConversations).mockReturnValueOnce({
      conversations,
      loading: false,
      error: null,
      refetch: vi.fn(),
      rename: vi.fn(),
      filteredConversations: conversations,
    });

    const { container } = render(
      <MemoryRouter>
        <Sidebar isOpen={true} isCollapsed={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(container.querySelector('.workspace-thread-list__heading')).not.toBeInTheDocument();
    expect(
      container.querySelector('.workspace-thread-list__group-heading'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compact chat' })).not.toBeInTheDocument();
    expect(container.querySelector('.conversation-title-icon')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Abrir historial de conversaciones' }),
    ).toBeInTheDocument();
  });
});

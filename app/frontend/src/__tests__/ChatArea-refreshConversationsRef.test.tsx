/**
 * Integration test for refreshConversationsRef cross-component refetch pattern.
 *
 * Tests that after sending a message, the refreshConversationsRef is called
 * to trigger a sidebar conversation list refetch (issue #77 fix).
 *
 * The pattern:
 * - App.tsx creates a conversationsRef and passes it to Sidebar and ChatArea
 * - Sidebar.tsx stores its refetch function in conversationsRef.current
 * - ChatArea.tsx calls conversationsRef.current?.() after a message is sent
 *
 * This test verifies the wiring in ChatArea works correctly.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatArea } from '../components/ChatArea';
import { ToastContext } from '../hooks/useToast';
import * as api from '../lib/api';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock scrollIntoView for jsdom
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// Mutable ref captured by the useToast mock factory - updated in beforeEach
const addToastRef = { current: vi.fn() };
const startStreamMock = vi.fn().mockResolvedValue({ fullText: 'Test response', sources: [] });
const abortStreamMock = vi.fn();
const getConversationMock = vi.spyOn(api, 'getConversation');

function renderChat(ui: ReactElement) {
  return render(
    <ToastContext.Provider value={{ addToast: addToastRef.current, removeToast: vi.fn() }}>
      {ui}
    </ToastContext.Provider>,
  );
}

afterEach(cleanup);

describe('ChatArea refreshConversationsRef', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, 'getConversations').mockResolvedValue([]);
    getConversationMock.mockResolvedValue({
      id: 'conv-1',
      title: 'Test conversation',
      created_at: '',
      updated_at: '',
      messages: [],
    });
    // Reset addToastRef to a fresh spy for each test
    addToastRef.current = vi.fn();
  });

  it('should call refreshConversationsRef after successful message send', async () => {
    const mockRefetch = vi.fn().mockResolvedValue(undefined);
    const refreshConversationsRef = { current: mockRefetch };

    renderChat(
      <MemoryRouter>
        <ChatArea
          conversationId="conv-1"
          startStream={startStreamMock}
          abortStream={abortStreamMock}
          refreshConversationsRef={
            refreshConversationsRef as React.MutableRefObject<(() => Promise<void>) | null>
          }
        />
      </MemoryRouter>,
    );

    // Wait for ChatInput to be ready
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    // Type and send a message
    const input = screen.getByRole('textbox');
    const sendButton = screen.getByRole('button', { name: /enviar mensaje/i });

    fireEvent.change(input, { target: { value: 'Hello test message' } });
    fireEvent.click(sendButton);

    // Verify refreshConversationsRef was called once after message send
    await waitFor(
      () => {
        expect(mockRefetch).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 },
    );
  });

  it('should keep one editable follow-up while a response is streaming', async () => {
    renderChat(
      <MemoryRouter>
        <ChatArea
          conversationId="conv-1"
          runtime={{
            status: 'running',
            phase: 'streaming',
            content: 'Respuesta parcial',
            sources: [],
            streamingStatus: null,
            error: null,
            failedMessage: null,
            canRetry: false,
          }}
          startStream={startStreamMock}
          abortStream={abortStreamMock}
        />
      </MemoryRouter>,
    );

    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Primer follow-up' } });
    await waitFor(() => expect(input).toHaveValue('Primer follow-up'));
    fireEvent.click(screen.getByRole('button', { name: /poner mensaje en cola/i }));

    expect(screen.getByLabelText('Mensaje en cola')).toHaveTextContent('Primer follow-up');
    expect(screen.getAllByText('Mensaje en cola')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /editar mensaje en cola/i }));
    expect(input).toHaveValue('Primer follow-up');
    expect(screen.queryByLabelText('Mensaje en cola')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /poner mensaje en cola/i }));
    fireEvent.click(screen.getByRole('button', { name: /eliminar mensaje en cola/i }));
    expect(screen.queryByLabelText('Mensaje en cola')).not.toBeInTheDocument();
  });

  it('dispatches a queued follow-up after an off-screen stream stops', async () => {
    let resolveFirst!: (value: null) => void;
    const firstStream = new Promise<null>((resolve) => {
      resolveFirst = resolve;
    });
    const startStream = vi
      .fn()
      .mockReturnValueOnce(firstStream)
      .mockResolvedValueOnce({ fullText: 'Queued response', sources: [] });
    getConversationMock.mockImplementation(async (id) => ({
      id,
      title: `Conversation ${id}`,
      created_at: '',
      updated_at: '',
      messages: [],
    }));

    const tree = (conversationId: string) => (
      <ToastContext.Provider value={{ addToast: addToastRef.current, removeToast: vi.fn() }}>
        <MemoryRouter>
          <ChatArea
            conversationId={conversationId}
            startStream={startStream}
            abortStream={abortStreamMock}
          />
        </MemoryRouter>
      </ToastContext.Provider>
    );
    const view = render(tree('conv-1'));

    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'First message' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar mensaje/i }));
    await waitFor(() => expect(startStream).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { value: 'Queued message' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar mensaje/i }));
    expect(screen.getByLabelText('Mensaje en cola')).toHaveTextContent('Queued message');

    view.rerender(tree('conv-2'));
    await act(async () => {
      resolveFirst(null);
      await firstStream;
    });

    await waitFor(() => {
      expect(startStream).toHaveBeenNthCalledWith(2, 'conv-1', 'Queued message');
    });
    expect(screen.queryByText('Queued message')).not.toBeInTheDocument();
  });

  it('does not dispatch a queued follow-up after unmount', async () => {
    let resolveFirst!: (value: null) => void;
    const firstStream = new Promise<null>((resolve) => {
      resolveFirst = resolve;
    });
    const startStream = vi.fn().mockReturnValueOnce(firstStream);
    const view = renderChat(
      <MemoryRouter>
        <ChatArea conversationId="conv-1" startStream={startStream} abortStream={abortStreamMock} />
      </MemoryRouter>,
    );

    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'First message' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar mensaje/i }));
    await waitFor(() => expect(startStream).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { value: 'Queued message' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar mensaje/i }));
    view.unmount();
    await act(async () => {
      resolveFirst(null);
      await firstStream;
    });

    expect(startStream).toHaveBeenCalledTimes(1);
  });

  it('shows a retry action when loading messages fails', async () => {
    getConversationMock.mockRejectedValueOnce(new Error('HTTP 500'));

    renderChat(
      <MemoryRouter>
        <ChatArea
          conversationId="conv-1"
          startStream={startStreamMock}
          abortStream={abortStreamMock}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('gives every loading skeleton line an explicit height', async () => {
    getConversationMock.mockImplementationOnce(() => new Promise<never>(() => {}));

    renderChat(
      <MemoryRouter>
        <ChatArea
          conversationId="conv-1"
          startStream={startStreamMock}
          abortStream={abortStreamMock}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(document.querySelectorAll('.skeleton').length).toBeGreaterThan(0));
    for (const line of document.querySelectorAll('.skeleton')) {
      expect(line).toHaveClass('h-4');
    }
  });

  it('keeps completed assistant response keys unique across turns', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    startStreamMock
      .mockResolvedValueOnce({ fullText: 'First response', sources: [] })
      .mockResolvedValueOnce({ fullText: 'Second response', sources: [] });

    renderChat(
      <MemoryRouter>
        <ChatArea
          conversationId="conv-1"
          startStream={startStreamMock}
          abortStream={abortStreamMock}
        />
      </MemoryRouter>,
    );

    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'First message' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar mensaje/i }));
    expect(await screen.findByText('First response')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Second message' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar mensaje/i }));
    expect(await screen.findByText('Second response')).toBeInTheDocument();

    expect(consoleError.mock.calls.some(([message]) => String(message).includes('same key'))).toBe(
      false,
    );
    consoleError.mockRestore();
  });

  it('should NOT call refreshConversationsRef when send fails', async () => {
    const mockRefetch = vi.fn().mockResolvedValue(undefined);
    const refreshConversationsRef = { current: mockRefetch };

    startStreamMock.mockRejectedValueOnce(new Error('HTTP 500'));

    renderChat(
      <MemoryRouter>
        <ChatArea
          conversationId="conv-1"
          startStream={startStreamMock}
          abortStream={abortStreamMock}
          refreshConversationsRef={
            refreshConversationsRef as React.MutableRefObject<(() => Promise<void>) | null>
          }
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    const input = screen.getByRole('textbox');
    const sendButton = screen.getByRole('button', { name: /enviar mensaje/i });

    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.click(sendButton);

    // Wait a bit for any async operations
    await new Promise((resolve) => setTimeout(resolve, 100));

    // refreshConversationsRef should NOT have been called on error
    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it('should handle undefined refreshConversationsRef gracefully', async () => {
    // This tests that refreshConversationsRef?.current?.() doesn't throw
    // when ref is undefined/null

    // No error should be thrown when refreshConversationsRef is undefined
    renderChat(
      <MemoryRouter>
        <ChatArea
          conversationId="conv-1"
          refreshConversationsRef={undefined}
          startStream={startStreamMock}
          abortStream={abortStreamMock}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    const input = screen.getByRole('textbox');
    const sendButton = screen.getByRole('button', { name: /enviar mensaje/i });

    fireEvent.change(input, { target: { value: 'Test' } });

    // Should not throw even though refreshConversationsRef is undefined
    expect(() => fireEvent.click(sendButton)).not.toThrow();
  });

  it('should create conversation and navigate when sending with no conversationId', async () => {
    const mockConv = { id: 'new-conv-123', title: 'New Chat', created_at: '', updated_at: '' };
    vi.spyOn(api, 'createConversation').mockResolvedValue(mockConv as api.Conversation);

    renderChat(
      <MemoryRouter>
        <ChatArea
          conversationId={undefined}
          refreshConversationsRef={undefined}
          startStream={startStreamMock}
          abortStream={abortStreamMock}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('textbox')).toBeInTheDocument());

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Hello world' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar mensaje/i }));

    await waitFor(() => {
      expect(api.createConversation).toHaveBeenCalledTimes(1);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/c/new-conv-123', {
      state: { pendingMessage: 'Hello world' },
    });
  });

  it('should handle createConversation error gracefully', async () => {
    vi.spyOn(api, 'createConversation').mockRejectedValue(new Error('Server error'));

    renderChat(
      <MemoryRouter>
        <ChatArea
          conversationId={undefined}
          startStream={startStreamMock}
          abortStream={abortStreamMock}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('textbox')).toBeInTheDocument());

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Test' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar mensaje/i }));

    await waitFor(() => {
      expect(addToastRef.current).toHaveBeenCalledWith(
        'No pudimos crear la conversación. Intenta nuevamente.',
        'error',
      );
    });
  });
});

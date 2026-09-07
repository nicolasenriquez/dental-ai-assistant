import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { useMessages } from './useMessages';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, getConversation: vi.fn() };
});

function conversation(id: string, content: string): api.ConversationWithMessages {
  return {
    id,
    title: `Conversation ${id}`,
    created_at: '2026-09-06T00:00:00Z',
    updated_at: '2026-09-06T00:00:00Z',
    messages: [
      {
        id: `${id}-message`,
        conversation_id: id,
        role: 'assistant',
        content,
        created_at: '2026-09-06T00:00:00Z',
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe('useMessages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ignores a stale response after switching conversations', async () => {
    const first = deferred<api.ConversationWithMessages>();
    const second = deferred<api.ConversationWithMessages>();
    vi.mocked(api.getConversation).mockImplementation((id) =>
      id === 'conversation-a' ? first.promise : second.promise,
    );

    const { result, rerender } = renderHook(({ id }: { id: string }) => useMessages(id), {
      initialProps: { id: 'conversation-a' },
    });

    await waitFor(() => expect(api.getConversation).toHaveBeenCalledWith('conversation-a'));
    rerender({ id: 'conversation-b' });
    await waitFor(() => expect(api.getConversation).toHaveBeenCalledWith('conversation-b'));

    await act(async () => {
      second.resolve(conversation('conversation-b', 'B answer'));
      await second.promise;
    });
    await waitFor(() => expect(result.current.messages[0]?.content).toBe('B answer'));

    await act(async () => {
      first.resolve(conversation('conversation-a', 'stale A answer'));
      await first.promise;
    });

    expect(result.current.conversation?.id).toBe('conversation-b');
    expect(result.current.messages[0]?.content).toBe('B answer');
  });

  it('exposes reload for the currently selected conversation', async () => {
    const initial = conversation('conversation-a', 'Initial answer');
    const refreshed = conversation('conversation-a', 'Refreshed answer');
    vi.mocked(api.getConversation).mockResolvedValueOnce(initial).mockResolvedValueOnce(refreshed);

    const { result } = renderHook(() => useMessages('conversation-a'));
    await waitFor(() => expect(result.current.messages[0]?.content).toBe('Initial answer'));

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.messages[0]?.content).toBe('Refreshed answer');
  });
});

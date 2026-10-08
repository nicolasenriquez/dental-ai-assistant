import { useCallback, useEffect, useRef, useState } from 'react';
import { type Conversation, getConversations, renameConversation } from '../lib/api';

const LEGACY_DEFAULT_TITLE = 'New Conversation';
const DEFAULT_TITLE = 'Nueva conversación';

export function getConversationDisplayTitle(title: string): string {
  return title === LEGACY_DEFAULT_TITLE ? DEFAULT_TITLE : title;
}

export function useConversations(searchQuery?: string, enabled = true) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-fetch ID so a stale response can't overwrite fresher results
  // when the user types faster than the network replies.
  const fetchIdRef = useRef(0);
  // Mirror of the latest list so a failed rename can revert only its own
  // title instead of restoring a whole-list snapshot.
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const load = useCallback(async () => {
    const myId = ++fetchIdRef.current;
    if (!enabled) {
      setLoading(false);
      setError(null);
      setConversations([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await getConversations();
      if (myId === fetchIdRef.current) setConversations(data);
    } catch (e) {
      if (myId === fetchIdRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to load conversations');
      }
    } finally {
      if (myId === fetchIdRef.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
    return () => {
      fetchIdRef.current += 1;
    };
  }, [load]);

  const rename = async (id: string, title: string): Promise<{ ok: boolean; error?: string }> => {
    const prevTitle = conversationsRef.current.find((c) => c.id === id)?.title;
    setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)));
    try {
      await renameConversation(id, title);
      return { ok: true };
    } catch (e) {
      // Functional rollback limited to the still-current optimistic entry:
      // never clobber a fresher title applied by a later rename or refetch.
      // Then reconcile authoritatively so failed renames never linger.
      setConversations((cs) =>
        cs.map((c) => (c.id === id && c.title === title ? { ...c, title: prevTitle ?? title } : c)),
      );
      void load();
      const msg = e instanceof Error ? e.message : 'Rename failed';
      return { ok: false, error: msg };
    }
  };

  // Filter out conversations with zero messages (preview === null).
  // Keep conversations unfiltered for guard logic in Sidebar.tsx.
  const withMessages = conversations
    .filter((c) => c.preview !== null)
    .map((conversation) => ({
      ...conversation,
      title: getConversationDisplayTitle(conversation.title),
    }));

  const trimmed = (searchQuery ?? '').trim().toLowerCase();
  const filteredConversations = trimmed
    ? withMessages.filter((c) => c.title.toLowerCase().includes(trimmed))
    : withMessages;

  return {
    conversations,
    loading,
    error,
    refetch: load,
    rename,
    filteredConversations,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { type Conversation, type Message, getConversation } from '../lib/api';

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!conversationId) {
      setMessages([]);
      setConversation(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getConversation(conversationId);
      if (requestId !== requestIdRef.current) return;
      setMessages(data.messages);
      setConversation({
        id: data.id,
        title: data.title,
        created_at: data.created_at,
        updated_at: data.updated_at,
      });
    } catch (e) {
      if (requestId === requestIdRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to load messages');
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  return { messages, setMessages, loading, error, conversation, reload };
}

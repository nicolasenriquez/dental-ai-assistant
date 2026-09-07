import { useCallback, useEffect, useRef, useState } from 'react';
import { type Citation, RateLimitError } from '../lib/api';

export interface StreamResult {
  fullText: string;
  sources: Citation[];
}

export interface StreamingStatus {
  tool: string;
  subject: string;
}

export interface ConversationRuntime {
  status: 'running' | 'error';
  content: string;
  sources: Citation[];
  streamingStatus: StreamingStatus | null;
  error: Error | null;
  failedMessage: string | null;
  canRetry: boolean;
}

export type RuntimeByConversationId = Record<string, ConversationRuntime>;

export function useStreamingResponse() {
  const [runtimeByConversationId, setRuntimeByConversationId] = useState<RuntimeByConversationId>(
    {},
  );
  const streamAbortRef = useRef(new Map<string, AbortController>());

  const clearRuntime = useCallback((conversationId: string) => {
    setRuntimeByConversationId((current) => {
      if (!(conversationId in current)) return current;
      const next = { ...current };
      delete next[conversationId];
      return next;
    });
  }, []);

  const abortStream = useCallback((conversationId: string) => {
    streamAbortRef.current.get(conversationId)?.abort();
  }, []);

  const startStream = useCallback(
    async (conversationId: string, userMessage: string): Promise<StreamResult | null> => {
      if (streamAbortRef.current.has(conversationId)) {
        throw new Error('A response is already in progress for this conversation');
      }

      const abortController = new AbortController();
      streamAbortRef.current.set(conversationId, abortController);
      setRuntimeByConversationId((current) => ({
        ...current,
        [conversationId]: {
          status: 'running',
          content: '',
          sources: [],
          streamingStatus: null,
          error: null,
          failedMessage: null,
          canRetry: false,
        },
      }));

      let fullText = '';
      let sources: Citation[] = [];

      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: userMessage }),
          signal: abortController.signal,
        });

        if (res.status === 401) {
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            const returnTo = window.location.pathname + window.location.search;
            window.location.assign(`/login?from=${encodeURIComponent(returnTo)}`);
          }
          throw new Error('Not authenticated');
        }
        if (res.status === 429) {
          // MISSION §10 #1 — daily cap hit. Body: {error, limit, window_hours, reset_at}.
          let body: Record<string, unknown> | null = null;
          try {
            body = await res.json();
          } catch (jsonErr) {
            console.warn('[useStreamingResponse] Failed to parse 429 body:', jsonErr);
          }
          if (body && typeof body === 'object' && 'limit' in body) {
            throw new RateLimitError(
              body as { limit: number; window_hours: number; reset_at: string },
            );
          }
          throw new Error('Daily message limit reached');
        }
        if (!res.ok) {
          let errorText = '';
          try {
            errorText = await res.text();
          } catch (textErr) {
            console.warn('[useStreamingResponse] Failed to read error body:', textErr);
          }
          throw new Error(`HTTP ${res.status}${errorText ? `: ${errorText}` : ''}`);
        }
        if (!res.body) throw new Error('No response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        // Buffer for incomplete SSE data between reader.read() calls
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE events are separated by blank lines (\n\n)
          const parts = buffer.split('\n\n');
          // The last part may be incomplete — keep it in the buffer
          buffer = parts.pop() ?? '';

          for (const rawEvent of parts) {
            if (!rawEvent.trim()) continue;

            let eventType = 'message';
            const dataLines: string[] = [];

            for (const line of rawEvent.split('\n')) {
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                // Support both "data: value" and "data:value"
                const val = line.slice(5);
                dataLines.push(val.startsWith(' ') ? val.slice(1) : val);
              }
            }

            const data = dataLines.join('\n');

            if (eventType === 'sources') {
              // Parse the sources JSON array of video titles
              try {
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed)) {
                  sources = parsed;
                  setRuntimeByConversationId((current) => ({
                    ...current,
                    [conversationId]: {
                      ...current[conversationId],
                      sources: parsed,
                    },
                  }));
                }
              } catch (e) {
                console.warn('[useStreamingResponse] Failed to parse sources event:', e);
              }
            } else if (eventType === 'status') {
              try {
                const parsed = JSON.parse(data);
                if (parsed && typeof parsed === 'object' && 'type' in parsed) {
                  if (parsed.type === 'tool_call_start') {
                    const streamingStatus = {
                      tool: String(parsed.tool ?? ''),
                      subject: String(parsed.subject ?? ''),
                    };
                    setRuntimeByConversationId((current) => ({
                      ...current,
                      [conversationId]: {
                        ...current[conversationId],
                        streamingStatus,
                      },
                    }));
                  } else if (parsed.type === 'tool_call_done') {
                    setRuntimeByConversationId((current) => ({
                      ...current,
                      [conversationId]: {
                        ...current[conversationId],
                        streamingStatus: null,
                      },
                    }));
                  }
                }
              } catch (e) {
                console.warn('[useStreamingResponse] Failed to parse status event:', e);
              }
            } else if (data === '[DONE]') {
              // Stream complete — no action needed here
            } else if (data.startsWith('{"error"')) {
              // Server sent an error payload mid-stream
              let errMsg = 'Stream error from server';
              try {
                errMsg = JSON.parse(data).error || errMsg;
              } catch {
                // Use default message
              }
              throw new Error(errMsg);
            } else if (data) {
              // Tokens are JSON-encoded strings to safely handle newlines/special chars
              let token = data;
              try {
                const parsed = JSON.parse(data);
                if (typeof parsed === 'string') {
                  token = parsed;
                }
              } catch {
                // Not JSON-encoded — use raw data (backward compat)
              }
              fullText += token;
              setRuntimeByConversationId((current) => ({
                ...current,
                [conversationId]: {
                  ...current[conversationId],
                  content: fullText,
                  streamingStatus: null,
                },
              }));
            }
          }
        }

        clearRuntime(conversationId);
        return { fullText, sources };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          clearRuntime(conversationId);
          return null;
        }

        const streamError = error instanceof Error ? error : new Error(String(error));
        setRuntimeByConversationId((current) => ({
          ...current,
          [conversationId]: {
            status: 'error',
            content: fullText,
            sources,
            streamingStatus: null,
            error: streamError,
            failedMessage: userMessage,
            canRetry: !(streamError instanceof RateLimitError),
          },
        }));
        throw streamError;
      } finally {
        if (streamAbortRef.current.get(conversationId) === abortController) {
          streamAbortRef.current.delete(conversationId);
        }
      }
    },
    [clearRuntime],
  );

  useEffect(() => {
    return () => {
      for (const controller of streamAbortRef.current.values()) controller.abort();
      streamAbortRef.current.clear();
    };
  }, []);

  return {
    runtimeByConversationId,
    startStream,
    abortStream,
    clearRuntime,
  };
}

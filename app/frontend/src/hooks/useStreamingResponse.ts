import { useCallback, useEffect, useRef, useState } from 'react';
import { type Citation, RateLimitError } from '../lib/api';
import { consumeSse } from '../lib/sse';

export interface StreamResult {
  fullText: string;
  sources: Citation[];
  stopped?: boolean;
  terminationReason?:
    | 'completed'
    | 'user_cancelled'
    | 'client_disconnected'
    | 'provider_timeout'
    | 'length'
    | 'failed';
}

export interface StreamingStatus {
  tool: string;
  subject: string;
}

export type ChatRunState =
  | 'idle'
  | 'submitting'
  | 'waiting_first_token'
  | 'streaming'
  | 'stopping'
  | 'completed'
  | 'failed'
  | 'disconnected';

export interface ConversationRuntime {
  status: 'running' | 'error';
  phase?: ChatRunState;
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
  const streamAbortRef = useRef(new Map<string, { controller: AbortController; runId: string }>());

  const clearRuntime = useCallback((conversationId: string) => {
    setRuntimeByConversationId((current) => {
      if (!(conversationId in current)) return current;
      const next = { ...current };
      delete next[conversationId];
      return next;
    });
  }, []);

  const abortStream = useCallback((conversationId: string) => {
    if (streamAbortRef.current.has(conversationId)) {
      setRuntimeByConversationId((current) => ({
        ...current,
        [conversationId]: {
          ...current[conversationId],
          phase: 'stopping',
        },
      }));
    }
    const active = streamAbortRef.current.get(conversationId);
    if (!active) return;
    void fetch(`/api/conversations/${conversationId}/runs/${active.runId}/cancel`, {
      method: 'POST',
      credentials: 'include',
    }).finally(() => active.controller.abort());
  }, []);

  const startStream = useCallback(
    async (conversationId: string, userMessage: string): Promise<StreamResult | null> => {
      if (streamAbortRef.current.has(conversationId)) {
        throw new Error('A response is already in progress for this conversation');
      }

      const abortController = new AbortController();
      const runId = crypto.randomUUID();
      streamAbortRef.current.set(conversationId, { controller: abortController, runId });
      setRuntimeByConversationId((current) => ({
        ...current,
        [conversationId]: {
          status: 'running',
          phase: 'submitting',
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
      let terminationReason: StreamResult['terminationReason'] = 'completed';

      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: userMessage, run_id: runId }),
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

        setRuntimeByConversationId((current) => ({
          ...current,
          [conversationId]: {
            ...current[conversationId],
            phase: 'waiting_first_token',
          },
        }));

        await consumeSse(
          res,
          ({ event: eventType, data }) => {
            const resolvedEventType = eventType ?? 'message';
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
            } else if (resolvedEventType === 'termination') {
              if (
                data === 'completed' ||
                data === 'provider_timeout' ||
                data === 'length' ||
                data === 'failed'
              ) {
                terminationReason = data;
              }
            } else if (resolvedEventType === 'status') {
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
                  phase: 'streaming',
                  content: fullText,
                  streamingStatus: null,
                },
              }));
            }
          },
          abortController.signal,
        );

        setRuntimeByConversationId((current) => ({
          ...current,
          [conversationId]: {
            ...current[conversationId],
            phase: 'completed',
            content: fullText,
            sources,
          },
        }));
        return { fullText, sources, terminationReason };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setRuntimeByConversationId((current) => ({
            ...current,
            [conversationId]: {
              ...current[conversationId],
              phase: 'completed',
            },
          }));
          return { fullText, sources, stopped: true, terminationReason: 'user_cancelled' };
        }

        const streamError = error instanceof Error ? error : new Error(String(error));
        setRuntimeByConversationId((current) => ({
          ...current,
          [conversationId]: {
            status: 'error',
            phase: streamError instanceof TypeError ? 'disconnected' : 'failed',
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
        if (streamAbortRef.current.get(conversationId)?.controller === abortController) {
          streamAbortRef.current.delete(conversationId);
        }
      }
    },
    [],
  );

  useEffect(() => {
    return () => {
      for (const { controller } of streamAbortRef.current.values()) controller.abort();
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

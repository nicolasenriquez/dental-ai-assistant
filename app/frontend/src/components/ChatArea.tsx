import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useMessages } from '../hooks/useMessages';
import type { ConversationRuntime, StreamResult } from '../hooks/useStreamingResponse';
import { useToast } from '../hooks/useToast';
import type { Citation, Message as MessageType } from '../lib/api';
import { RateLimitError, createConversation } from '../lib/api';
import { exportConversationAsMarkdown } from '../lib/exportMarkdown';
import { ChatInput, type ChatInputHandle } from './ChatInput';
import { CitationModal } from './CitationModal';
import { Message } from './Message';

function formatResetTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ── Skeleton message rows ─────────────────────────────────────────
function SkeletonMessages() {
  const rows: Array<{ align: 'flex-end' | 'flex-start'; widths: string[] }> = [
    { align: 'flex-end', widths: ['60%', '40%'] },
    { align: 'flex-start', widths: ['75%', '55%', '70%'] },
    { align: 'flex-end', widths: ['45%'] },
    { align: 'flex-start', widths: ['80%', '60%'] },
  ];

  return (
    <>
      {rows.map((row, ri) => (
        <div
          key={ri}
          style={{
            display: 'flex',
            justifyContent: row.align,
            marginBottom: 12,
            padding: '0 24px',
          }}
        >
          <div
            style={{
              maxWidth: row.align === 'flex-end' ? '70%' : '80%',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {row.widths.map((w, wi) => (
              <div key={wi} className="skeleton" style={{ height: 16, width: w }} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// ── Empty / landing state ─────────────────────────────────────────
interface EmptyStateProps {
  onStarterClick: (text: string) => void;
}

function EmptyState({ onStarterClick }: EmptyStateProps) {
  const starters = [
    'How do I use subagents in Claude Code?',
    'How should I structure an agent team?',
    "How does Cole's complete agentic coding workflow look end-to-end?",
    'How do I turn Claude Code into an engineering team?',
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      <svg
        width="56"
        height="56"
        viewBox="0 0 56 56"
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1.5"
        style={{ marginBottom: 20, opacity: 0.7 }}
      >
        <circle cx="28" cy="28" r="24" />
        <path d="M18,22 L38,22 M18,28 L34,28 M18,34 L30,34" strokeLinecap="round" />
      </svg>
      <h1 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600, color: '#f1f5f9' }}>
        Pregunta sobre la biblioteca de videos
      </h1>
      <p style={{ margin: '0 0 24px', color: '#94a3b8', maxWidth: 380, lineHeight: 1.6 }}>
        Esta IA tiene acceso a las transcripciones de una colección seleccionada de videos de
        YouTube.
      </p>
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 400 }}
      >
        {starters.map((q) => (
          <button
            key={q}
            onClick={() => onStarterClick(q)}
            className="min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
            style={{
              padding: '10px 16px',
              background: '#1e293b',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.06)',
              color: '#94a3b8',
              fontSize: 14,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(30,41,59,0.9)';
              e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)';
              e.currentTarget.style.color = '#f1f5f9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#1e293b';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Load error state ──────────────────────────────────────────────
function LoadErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        padding: 40,
        textAlign: 'center',
      }}
    >
      <p style={{ color: '#ef4444', marginBottom: 16 }}>{message}</p>
      <button
        onClick={onRetry}
        className="min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
        style={{
          background: '#1e293b',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          color: '#f1f5f9',
          cursor: 'pointer',
          padding: '8px 20px',
          fontSize: 14,
        }}
      >
        Reintentar
      </button>
    </div>
  );
}

// ── Inline send error ─────────────────────────────────────────────
interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
}

function InlineError({ message, onRetry }: InlineErrorProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 10,
        padding: '12px 16px',
        margin: '4px 0',
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="#ef4444"
        strokeWidth="1.8"
        strokeLinecap="round"
        style={{ flexShrink: 0 }}
      >
        <circle cx="8" cy="8" r="7" />
        <line x1="8" y1="5" x2="8" y2="8.5" />
        <circle cx="8" cy="11" r="0.5" fill="#ef4444" stroke="none" />
      </svg>
      <p style={{ flex: 1, margin: 0, fontSize: 14, color: '#f1f5f9' }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-error-retry min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

// ── Main ChatArea component ───────────────────────────────────────
interface ChatAreaProps {
  conversationId?: string;
  refreshConversationsRef?: MutableRefObject<(() => Promise<void>) | null>;
  runtime?: ConversationRuntime;
  startStream: (conversationId: string, userMessage: string) => Promise<StreamResult | null>;
  abortStream: (conversationId: string) => void;
}

export function ChatArea({
  conversationId,
  refreshConversationsRef,
  runtime,
  startStream,
  abortStream,
}: ChatAreaProps) {
  const navigate = useNavigate();
  const { messages, setMessages, loading, error, conversation, reload } = useMessages(
    conversationId || null,
  );
  const { addToast } = useToast();
  const { refresh: refreshAuth } = useAuth();
  const isStreaming = runtime?.status === 'running';
  const runtimeError = runtime?.status === 'error' ? runtime.error : null;
  const failedMessageText = runtime?.failedMessage ?? null;
  const currentConversationIdRef = useRef(conversationId);
  currentConversationIdRef.current = conversationId;

  // Pending message to send after creating a conversation on the landing page
  const pendingMessageRef = useRef<string | null>(null);

  const chatInputRef = useRef<ChatInputHandle>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const followFrameRef = useRef<number | null>(null);
  const pendingUserMsgIdsRef = useRef(new Map<string, string>());
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  // Citation modal state
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  // ── Auto-scroll logic ──
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    setShowJumpToBottom(false);
  }, []);

  const scheduleFollow = useCallback(() => {
    if (!autoScrollRef.current || followFrameRef.current !== null) return;
    followFrameRef.current = requestAnimationFrame(() => {
      followFrameRef.current = null;
      if (autoScrollRef.current) scrollToBottom('auto');
    });
  }, [scrollToBottom]);

  useEffect(() => {
    if (isStreaming) scheduleFollow();
  }, [isStreaming, runtime?.content, messages.length, scheduleFollow]);

  useEffect(() => {
    autoScrollRef.current = true;
    setShowJumpToBottom(false);
    if (!loading && messages.length > 0) {
      const timeoutId = setTimeout(() => {
        if (autoScrollRef.current) scrollToBottom('auto');
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [conversationId, loading, messages.length, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (followFrameRef.current !== null) cancelAnimationFrame(followFrameRef.current);
    };
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distFromBottom < 100;
    autoScrollRef.current = nearBottom;
    setShowJumpToBottom((visible) => (visible === !nearBottom ? visible : !nearBottom));
  }, []);

  // ── Citation click handler (opens modal) ──
  const handleCitationClick = useCallback((citation: Citation) => {
    setSelectedCitation(citation);
  }, []);

  // ── Send handler ──
  const handleSend = useCallback(
    async (content: string) => {
      // If no conversation, create one first then send
      if (!conversationId) {
        pendingMessageRef.current = content;
        try {
          const conv = await createConversation();
          navigate(`/c/${conv.id}`);
        } catch (e) {
          pendingMessageRef.current = null;
          console.error(
            '[ChatArea] Failed to create conversation:',
            e instanceof Error ? e.message : String(e),
          );
          addToast('No pudimos crear la conversación. Intenta nuevamente.', 'error');
        }
        return;
      }

      if (isStreaming) return;

      // ── Optimistic user message ──
      const tempId = `temp-user-${Date.now()}`;
      pendingUserMsgIdsRef.current.set(conversationId, tempId);

      const tempUserMsg: MessageType = {
        id: tempId,
        conversation_id: conversationId,
        role: 'user',
        content,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);
      autoScrollRef.current = true;
      scrollToBottom();

      try {
        const result = await startStream(conversationId, content);
        pendingUserMsgIdsRef.current.delete(conversationId);
        if (result && currentConversationIdRef.current === conversationId) {
          const assistantMsg: MessageType = {
            id: `temp-assistant-${Date.now()}`,
            conversation_id: conversationId,
            role: 'assistant',
            content: result.fullText,
            created_at: new Date().toISOString(),
            sources: result.sources.length > 0 ? result.sources : undefined,
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }
        // Pull fresh quota counter so the sidebar updates after each send.
        refreshAuth();
        // Refresh conversations list so sidebar shows auto-generated title.
        refreshConversationsRef?.current?.();
      } catch (e) {
        const removedId = pendingUserMsgIdsRef.current.get(conversationId);
        if (removedId && currentConversationIdRef.current === conversationId) {
          setMessages((prev) => prev.filter((m) => m.id !== removedId));
        }
        pendingUserMsgIdsRef.current.delete(conversationId);

        if (e instanceof RateLimitError) {
          // MISSION §10 #1 — daily cap hit. No retry; the user literally
          // can't send another message until the window slides forward.
          const friendly = `Alcanzaste el límite diario de mensajes (${e.limit}/día). Se reinicia a las ${formatResetTime(e.resetAt)}.`;
          if (currentConversationIdRef.current === conversationId) addToast(friendly, 'error');
          // Sync counter so the sidebar flips to 25/25 with a reset time.
          refreshAuth();
          // Restore message text so the user can resend after the window resets.
          if (currentConversationIdRef.current === conversationId) {
            setTimeout(() => chatInputRef.current?.setInputText(content), 50);
          }
          return;
        }

        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error('[ChatArea] Failed to send message:', errorMessage);
        if (currentConversationIdRef.current === conversationId) {
          addToast('No pudimos enviar el mensaje. Intenta nuevamente.', 'error');
          setTimeout(() => chatInputRef.current?.setInputText(content), 50);
        }
      }
    },
    [
      conversationId,
      isStreaming,
      navigate,
      setMessages,
      startStream,
      scrollToBottom,
      addToast,
      refreshAuth,
      refreshConversationsRef,
    ],
  );

  // ── Send pending message after conversation is created ──
  useEffect(() => {
    if (!conversationId || !pendingMessageRef.current) return;

    const msg = pendingMessageRef.current;
    pendingMessageRef.current = null;
    // 2s timeout — if handleSend hasn't completed by then, show error to user.
    // This catches the silent-failure path where conversationId is set but the pending
    // message never fires (e.g., component re-mount, race condition).
    const timeoutId = setTimeout(() => {
      addToast('No pudimos enviar el mensaje. Intenta nuevamente.', 'error');
    }, 2000);
    handleSend(msg);
    return () => clearTimeout(timeoutId);
  }, [conversationId, handleSend]);

  // ── Retry failed message — re-attempt the API call with same content ──
  const handleRetry = useCallback(() => {
    if (!conversationId || !runtime?.canRetry || !failedMessageText) return;
    void handleSend(failedMessageText);
  }, [conversationId, failedMessageText, handleSend, runtime?.canRetry]);

  // ── Starter click handler ──
  const handleStarterClick = useCallback((text: string) => {
    chatInputRef.current?.setInputText(text);
    chatInputRef.current?.focus();
  }, []);

  // ── Render ──
  const showEmpty = !conversationId;
  const showError = !loading && !!error && !showEmpty;
  const showMessages = !loading && !error && !showEmpty;
  const showSkeleton = loading && !showEmpty;

  const showStreamingBubble = isStreaming;

  const handleExport = useCallback(() => {
    try {
      if (conversation) {
        exportConversationAsMarkdown(conversation, messages);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[ChatArea] Export failed:', message);
      addToast('No pudimos exportar la conversación. Intenta nuevamente.', 'error');
    }
  }, [conversation, messages, addToast]);

  return (
    <div className="chat-area">
      {/* ── Message list area ── */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="chat-message-scroll">
        {/* ── Export button (visible when conversation is active) ── */}
        {conversation && messages.length > 0 && (
          <button
            type="button"
            onClick={handleExport}
            title="Exportar conversación como Markdown"
            className="chat-export-button min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 13 13"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2,9 L2,11.5 A0.5,0.5 0 0,0 2.5,12 L10.5,12 A0.5,0.5 0 0,0 11,11.5 L11,9" />
              <polyline points="6.5,1 6.5,8.5" />
              <polyline points="3.5,5.5 6.5,8.5 9.5,5.5" />
            </svg>
            Exportar
          </button>
        )}

        {showEmpty && <EmptyState onStarterClick={handleStarterClick} />}

        {showSkeleton && <SkeletonMessages />}

        {showError && (
          <LoadErrorState
            message="No pudimos cargar los mensajes. Intenta nuevamente."
            onRetry={() => void reload()}
          />
        )}

        {showMessages && (
          <div className="chat-message-stack">
            {messages.length === 0 && !runtimeError ? (
              <EmptyState onStarterClick={handleStarterClick} />
            ) : (
              messages.map((msg) => (
                <Message
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  sources={msg.sources}
                  onCitationClick={handleCitationClick}
                />
              ))
            )}

            {/* Streaming assistant bubble */}
            {showStreamingBubble && runtime && (
              <Message
                role="assistant"
                content={runtime.content}
                isStreaming={true}
                sources={runtime.sources.length > 0 ? runtime.sources : undefined}
                onCitationClick={handleCitationClick}
                streamingStatus={runtime.streamingStatus}
              />
            )}

            {/* Inline send error with retry */}
            {runtimeError && !isStreaming && (
              <InlineError
                message={
                  runtimeError instanceof RateLimitError
                    ? `Alcanzaste el límite diario de mensajes (${runtimeError.limit}/día). Se reinicia a las ${formatResetTime(runtimeError.resetAt)}.`
                    : 'No pudimos obtener una respuesta. Intenta nuevamente.'
                }
                onRetry={runtime?.canRetry ? handleRetry : undefined}
              />
            )}
          </div>
        )}

        <div ref={bottomRef} className="chat-scroll-anchor" />
      </div>

      {showJumpToBottom && (
        <button
          type="button"
          className="chat-jump-to-bottom min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          onClick={() => {
            autoScrollRef.current = true;
            scrollToBottom('smooth');
          }}
        >
          ↓ Ir al final
        </button>
      )}

      {/* ── Gradient fade above input ── */}
      <div className="chat-input-fade" aria-hidden="true" />

      {/* ── Chat input ── */}
      <div className="chat-input-dock">
        <ChatInput
          ref={chatInputRef}
          onSend={handleSend}
          isStreaming={isStreaming}
          disabled={isStreaming}
          onStop={conversationId ? () => abortStream(conversationId) : undefined}
        />
      </div>

      {/* ── Citation modal ── */}
      {selectedCitation && (
        <CitationModal citation={selectedCitation} onClose={() => setSelectedCitation(null)} />
      )}
    </div>
  );
}

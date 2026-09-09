import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useChatAutoFollow } from '../hooks/useChatAutoFollow';
import { useConversationViewportCache } from '../hooks/useConversationViewportCache';
import { useMessages } from '../hooks/useMessages';
import type { ConversationRuntime, StreamResult } from '../hooks/useStreamingResponse';
import { useToast } from '../hooks/useToast';
import type { Citation, Message as MessageType } from '../lib/api';
import { RateLimitError, createConversation } from '../lib/api';
import { exportConversationAsMarkdown } from '../lib/exportMarkdown';
import { ChatInput, type ChatInputHandle } from './ChatInput';
import { CitationModal } from './CitationModal';
import { Message } from './Message';
import { WorkspaceHeader } from './WorkspaceHeader';

const NEW_CHAT_KEY = '__new_chat__';
const pendingNewConversationMessages = new Map<string, string>();

function getPendingNavigationMessage(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  const value = (state as { pendingMessage?: unknown }).pendingMessage;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function formatResetTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function SkeletonMessages() {
  const rows: Array<{ align: 'flex-end' | 'flex-start'; widths: string[] }> = [
    { align: 'flex-end', widths: ['60%', '40%'] },
    { align: 'flex-start', widths: ['75%', '55%', '70%'] },
    { align: 'flex-end', widths: ['45%'] },
    { align: 'flex-start', widths: ['80%', '60%'] },
  ];

  return (
    <>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="chat-skeleton-row" style={{ justifyContent: row.align }}>
          <div
            className="chat-skeleton-content"
            style={{ maxWidth: row.align === 'flex-end' ? '70%' : '80%' }}
          >
            {row.widths.map((width, widthIndex) => (
              <div key={widthIndex} className="skeleton h-4" style={{ width }} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

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
    <div className="chat-empty-state">
      <svg
        width="56"
        height="56"
        viewBox="0 0 56 56"
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <circle cx="28" cy="28" r="24" />
        <path d="M18,22 L38,22 M18,28 L34,28 M18,34 L30,34" strokeLinecap="round" />
      </svg>
      <h1>Pregunta sobre la biblioteca de videos</h1>
      <p>
        Esta IA tiene acceso a las transcripciones de una colección seleccionada de videos de
        YouTube.
      </p>
      <div className="chat-starter-list">
        {starters.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onStarterClick(question)}
            className="chat-starter-button min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}

function LoadErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="chat-load-error">
      <p>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
      >
        Reintentar
      </button>
    </div>
  );
}

interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
}

function InlineError({ message, onRetry }: InlineErrorProps) {
  return (
    <div className="chat-inline-error" role="alert">
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="#ef4444"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="7" />
        <line x1="8" y1="5" x2="8" y2="8.5" />
        <circle cx="8" cy="11" r="0.5" fill="#ef4444" stroke="none" />
      </svg>
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-error-retry min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

interface QueuedMessageProps {
  content: string;
  onEdit: () => void;
  onRemove: () => void;
}

function QueuedMessage({ content, onEdit, onRemove }: QueuedMessageProps) {
  return (
    <div className="chat-queued-message" aria-label="Mensaje en cola">
      <div className="chat-queued-copy">
        <span className="chat-queued-label">Mensaje en cola</span>
        <span className="chat-queued-content">{content}</span>
      </div>
      <div className="chat-queued-actions">
        <button
          type="button"
          onClick={onEdit}
          aria-label="Editar mensaje en cola"
          className="focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Eliminar mensaje en cola"
          className="focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
        >
          Eliminar
        </button>
      </div>
    </div>
  );
}

function getRuntimeStatusText(runtime: ConversationRuntime | undefined, isStreaming: boolean) {
  if (!runtime) return null;
  if (runtime.phase === 'stopping') return 'Deteniendo…';
  if (runtime.phase === 'disconnected') return 'Conexión interrumpida · Reintentar';
  if (runtime.streamingStatus?.subject) return `Buscando: ${runtime.streamingStatus.subject}…`;
  if (runtime.phase === 'submitting' || runtime.phase === 'waiting_first_token') {
    return 'Preparando respuesta…';
  }
  if (runtime.phase === 'streaming' || isStreaming) return 'Generando respuesta…';
  return null;
}

interface ChatAreaProps {
  conversationId?: string;
  refreshConversationsRef?: MutableRefObject<(() => Promise<void>) | null>;
  runtime?: ConversationRuntime;
  startStream: (conversationId: string, userMessage: string) => Promise<StreamResult | null>;
  abortStream: (conversationId: string) => void;
  clearRuntime?: (conversationId: string) => void;
  refreshAuth?: () => void;
}

export function ChatArea({
  conversationId,
  refreshConversationsRef,
  runtime,
  startStream,
  abortStream,
  clearRuntime,
  refreshAuth,
}: ChatAreaProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { messages, setMessages, loading, error, conversation, reload } = useMessages(
    conversationId || null,
  );
  const { addToast } = useToast();
  const currentConversationIdRef = useRef(conversationId);
  currentConversationIdRef.current = conversationId;

  const chatInputRef = useRef<ChatInputHandle>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const chatInputDockRef = useRef<HTMLDivElement>(null);
  const creatingConversationRef = useRef(false);
  const mountedRef = useRef(true);
  const nextOptimisticTurnIdRef = useRef(0);
  const pendingUserMsgIdsRef = useRef(new Map<string, string>());
  const activeSendIdsRef = useRef(new Set<string>());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [queuedMessages, setQueuedMessages] = useState<Record<string, string>>({});
  const queuedMessagesRef = useRef(queuedMessages);
  queuedMessagesRef.current = queuedMessages;
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [stoppedMessageIds, setStoppedMessageIds] = useState<Set<string>>(new Set());
  const restoredConversationIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const area = chatAreaRef.current;
    const dock = chatInputDockRef.current;
    if (!area || !dock || typeof ResizeObserver === 'undefined') return;
    const updateClearance = () =>
      area.style.setProperty(
        '--composer-clearance',
        `${dock.getBoundingClientRect().height + 16}px`,
      );
    const observer = new ResizeObserver(updateClearance);
    observer.observe(dock);
    updateClearance();
    return () => observer.disconnect();
  }, []);

  const {
    scrollContainerRef,
    bottomSentinelRef,
    followMode,
    isFollowingLatest,
    onScroll,
    onContentAppended,
    followLatest,
    jumpToLatest,
    restoreFollowMode,
  } = useChatAutoFollow();
  const { restoreViewport } = useConversationViewportCache({
    conversationId,
    scrollContainerRef,
    isFollowingLatest,
  });

  const activePhase = runtime?.phase;
  const isStreaming =
    runtime?.status === 'running' &&
    (activePhase === undefined ||
      activePhase === 'submitting' ||
      activePhase === 'waiting_first_token' ||
      activePhase === 'streaming' ||
      activePhase === 'stopping');
  const runtimeError = runtime?.status === 'error' ? runtime.error : null;
  const failedMessageText = runtime?.failedMessage ?? null;
  const currentKey = conversationId ?? NEW_CHAT_KEY;
  const currentDraft = drafts[currentKey] ?? '';
  const queuedMessage = conversationId ? queuedMessages[conversationId] : undefined;
  const pendingNavigationMessage = conversationId
    ? (pendingNewConversationMessages.get(conversationId) ??
      getPendingNavigationMessage(location.state))
    : null;

  const setDraft = useCallback((value: string) => {
    const key = currentConversationIdRef.current ?? NEW_CHAT_KEY;
    setDrafts((current) => ({ ...current, [key]: value }));
  }, []);

  const setQueuedMessage = useCallback((id: string, value: string | null) => {
    setQueuedMessages((current) => {
      const next = { ...current };
      if (value === null) delete next[id];
      else next[id] = value;
      queuedMessagesRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!conversationId) {
      restoredConversationIdRef.current = null;
      restoreFollowMode('following');
      return;
    }
    if (loading || error || restoredConversationIdRef.current === conversationId) return;

    const savedViewport = restoreViewport(conversationId);
    const frame = window.requestAnimationFrame(() => {
      restoredConversationIdRef.current = conversationId;
      const container = scrollContainerRef.current;
      if (savedViewport && !savedViewport.wasFollowingLatest && container) {
        container.scrollTop = savedViewport.scrollTop;
        restoreFollowMode('history');
      } else if (savedViewport?.wasFollowingLatest || messages.length > 0) {
        followLatest('auto');
      } else {
        restoreFollowMode('following');
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    conversationId,
    error,
    followLatest,
    loading,
    messages.length,
    restoreFollowMode,
    restoreViewport,
    scrollContainerRef,
  ]);

  useEffect(() => {
    if (!loading && !error && conversationId) onContentAppended();
  }, [conversationId, error, loading, messages.length, onContentAppended, runtime?.content]);

  const handleCitationClick = useCallback((citation: Citation) => {
    setSelectedCitation(citation);
  }, []);

  const sendMessage = useCallback(
    async (id: string, content: string) => {
      activeSendIdsRef.current.add(id);
      const turnId = ++nextOptimisticTurnIdRef.current;
      const tempId = `temp-user-${id}-${turnId}`;
      pendingUserMsgIdsRef.current.set(id, tempId);
      if (currentConversationIdRef.current === id) {
        setMessages((previous) => [
          ...previous,
          {
            id: tempId,
            conversation_id: id,
            role: 'user',
            content,
            created_at: new Date().toISOString(),
          },
        ]);
        followLatest('auto');
        onContentAppended();
      }

      let queuedToDispatch: string | null = null;
      try {
        const result = await startStream(id, content);
        pendingUserMsgIdsRef.current.delete(id);

        if (
          result &&
          currentConversationIdRef.current === id &&
          (result.fullText || !result.stopped)
        ) {
          const assistantMessage: MessageType = {
            id: `assistant-stream-${id}-${turnId}`,
            conversation_id: id,
            role: 'assistant',
            content: result.fullText,
            created_at: new Date().toISOString(),
            sources: result.sources.length > 0 ? result.sources : undefined,
          };
          setMessages((previous) => [...previous, assistantMessage]);
          if (result.stopped)
            setStoppedMessageIds((current) => new Set(current).add(assistantMessage.id));
          onContentAppended();
        }

        if (mountedRef.current) {
          const queued = queuedMessagesRef.current[id];
          if (queued) {
            setQueuedMessage(id, null);
            queuedToDispatch = queued;
          }
        }

        // The completed result is in messages before the runtime is removed.
        clearRuntime?.(id);

        refreshAuth?.();
        refreshConversationsRef?.current?.();
      } catch (sendError) {
        const removedId = pendingUserMsgIdsRef.current.get(id);
        if (removedId && currentConversationIdRef.current === id) {
          setMessages((previous) => previous.filter((message) => message.id !== removedId));
        }
        pendingUserMsgIdsRef.current.delete(id);

        if (sendError instanceof RateLimitError) {
          const friendly = `Alcanzaste el límite diario de mensajes (${sendError.limit}/día). Se reinicia a las ${formatResetTime(sendError.resetAt)}.`;
          if (currentConversationIdRef.current === id) addToast(friendly, 'error');
          refreshAuth?.();
          if (currentConversationIdRef.current === id) {
            setTimeout(() => chatInputRef.current?.setInputText(content), 50);
          }
        } else {
          const errorMessage = sendError instanceof Error ? sendError.message : String(sendError);
          console.error('[ChatArea] Failed to send message:', errorMessage);
          if (currentConversationIdRef.current === id) {
            addToast('No pudimos enviar el mensaje. Intenta nuevamente.', 'error');
            setTimeout(() => chatInputRef.current?.setInputText(content), 50);
          }
        }
      } finally {
        activeSendIdsRef.current.delete(id);
      }

      if (queuedToDispatch && mountedRef.current) {
        void sendMessage(id, queuedToDispatch);
      }
    },
    [
      addToast,
      clearRuntime,
      followLatest,
      onContentAppended,
      refreshAuth,
      refreshConversationsRef,
      setMessages,
      setQueuedMessage,
      startStream,
    ],
  );

  const handleSend = useCallback(
    (content: string): boolean => {
      if (!conversationId) {
        if (creatingConversationRef.current) return false;
        creatingConversationRef.current = true;
        setDraft('');
        void createConversation()
          .then((newConversation) => {
            creatingConversationRef.current = false;
            pendingNewConversationMessages.set(newConversation.id, content);
            navigate(`/c/${newConversation.id}`, { state: { pendingMessage: content } });
          })
          .catch((createError: unknown) => {
            creatingConversationRef.current = false;
            console.error(
              '[ChatArea] Failed to create conversation:',
              createError instanceof Error ? createError.message : String(createError),
            );
            addToast('No pudimos crear la conversación. Intenta nuevamente.', 'error');
            setDraft(content);
          });
        return true;
      }

      const isBusy = isStreaming || activeSendIdsRef.current.has(conversationId);
      if (isBusy) {
        if (queuedMessagesRef.current[conversationId]) return false;
        setQueuedMessage(conversationId, content);
        setDraft('');
        return true;
      }

      setDraft('');
      void sendMessage(conversationId, content);
      return true;
    },
    [addToast, conversationId, isStreaming, navigate, sendMessage, setDraft, setQueuedMessage],
  );

  useEffect(() => {
    if (
      !conversationId ||
      loading ||
      !pendingNavigationMessage ||
      conversation?.id !== conversationId
    ) {
      return;
    }

    pendingNewConversationMessages.delete(conversationId);
    if (location.state) navigate(location.pathname, { replace: true, state: null });
    const timeoutId = window.setTimeout(() => {
      addToast('No pudimos enviar el mensaje. Intenta nuevamente.', 'error');
    }, 2000);
    handleSend(pendingNavigationMessage);
    return () => window.clearTimeout(timeoutId);
  }, [
    addToast,
    conversation,
    conversationId,
    handleSend,
    loading,
    location.pathname,
    navigate,
    pendingNavigationMessage,
  ]);

  const handleRetry = useCallback(() => {
    if (!conversationId || !runtime?.canRetry || !failedMessageText) return;
    void handleSend(failedMessageText);
  }, [conversationId, failedMessageText, handleSend, runtime?.canRetry]);

  const handleStarterClick = useCallback((text: string) => {
    chatInputRef.current?.setInputText(text);
    chatInputRef.current?.focus();
  }, []);

  const showEmpty = !conversationId;
  const showError = !loading && !!error && !showEmpty;
  const showMessages = !showEmpty;
  const showSkeleton = loading && !showEmpty;
  const showRuntimeBubble =
    !!runtime &&
    (runtime.status === 'error' || (runtime.status === 'running' && runtime.phase !== 'completed'));
  const runtimeStatusText = getRuntimeStatusText(runtime, isStreaming);

  const handleExport = useCallback(() => {
    try {
      if (conversation && conversation.id === conversationId) {
        exportConversationAsMarkdown(conversation, messages);
      }
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : String(exportError);
      console.error('[ChatArea] Export failed:', message);
      addToast('No pudimos exportar la conversación. Intenta nuevamente.', 'error');
    }
  }, [addToast, conversation, conversationId, messages]);

  return (
    <div ref={chatAreaRef} className="chat-area">
      <WorkspaceHeader
        title={conversation?.title ?? 'Chat'}
        description="Biblioteca de videos"
        actions={
          conversation && conversation.id === conversationId && messages.length > 0 && !loading ? (
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
                aria-hidden="true"
              >
                <path d="M2,9 L2,11.5 A0.5,0.5 0 0,0 2.5,12 L10.5,12 A0.5,0.5 0 0,0 11,11.5 L11,9" />
                <polyline points="6.5,1 6.5,8.5" />
                <polyline points="3.5,5.5 6.5,8.5 9.5,5.5" />
              </svg>
              Exportar
            </button>
          ) : undefined
        }
      />
      <div ref={scrollContainerRef} onScroll={onScroll} className="chat-message-scroll">
        {showEmpty && <EmptyState onStarterClick={handleStarterClick} />}

        {showMessages && (
          <div className="chat-message-stack">
            {showSkeleton ? (
              <SkeletonMessages />
            ) : showError ? (
              <LoadErrorState
                message="No pudimos cargar los mensajes. Intenta nuevamente."
                onRetry={() => void reload()}
              />
            ) : messages.length === 0 && !runtimeError ? (
              <EmptyState onStarterClick={handleStarterClick} />
            ) : (
              messages.map((message) => (
                <Message
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  sources={message.sources}
                  statusText={
                    stoppedMessageIds.has(message.id) ? 'Generación detenida.' : undefined
                  }
                  onCitationClick={handleCitationClick}
                />
              ))
            )}

            {runtimeStatusText && (
              <div
                className="chat-runtime-status"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {runtimeStatusText}
              </div>
            )}

            {showRuntimeBubble && runtime && (
              <Message
                key={`assistant-stream-${conversationId ?? 'new'}`}
                role="assistant"
                content={runtime.content}
                isStreaming={isStreaming}
                sources={runtime.sources.length > 0 ? runtime.sources : undefined}
                onCitationClick={handleCitationClick}
                streamingStatus={runtime.streamingStatus}
              />
            )}

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

            {queuedMessage && conversationId && (
              <QueuedMessage
                content={queuedMessage}
                onEdit={() => {
                  setDraft(queuedMessage);
                  setQueuedMessage(conversationId, null);
                  chatInputRef.current?.focus();
                }}
                onRemove={() => setQueuedMessage(conversationId, null)}
              />
            )}
          </div>
        )}

        <div ref={bottomSentinelRef} className="chat-scroll-anchor" />
      </div>

      {followMode === 'history' && (
        <button
          type="button"
          aria-label="Ir al mensaje más reciente"
          className="chat-jump-to-bottom min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          onClick={jumpToLatest}
        >
          ↓ Ir al mensaje más reciente
        </button>
      )}

      <div className="chat-input-fade" aria-hidden="true" />

      <div ref={chatInputDockRef} className="chat-input-dock">
        <div className="chat-input-dock-inner">
          <ChatInput
            ref={chatInputRef}
            value={currentDraft}
            onValueChange={setDraft}
            onSend={handleSend}
            isStreaming={isStreaming}
            runState={runtime?.phase}
            onStop={conversationId ? () => abortStream(conversationId) : undefined}
          />
        </div>
      </div>

      {selectedCitation && (
        <CitationModal citation={selectedCitation} onClose={() => setSelectedCitation(null)} />
      )}
    </div>
  );
}

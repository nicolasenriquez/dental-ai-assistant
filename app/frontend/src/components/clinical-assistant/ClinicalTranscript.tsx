import { Check, CircleX } from 'lucide-react';
import { useEffect, useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useChatAutoFollow } from '../../hooks/useChatAutoFollow';
import type {
  ClinicalApprovalItem as ApprovalItemData,
  ClinicalTranscriptItem,
  ClinicalDraftItem as DraftItemData,
} from '../../hooks/useClinicalAssistant';
import { useConversationViewportCache } from '../../hooks/useConversationViewportCache';
import type { ClinicalDraft } from '../../lib/api';
import { Message } from '../Message';
import { Spinner } from '../Spinner';
import { ApprovalRequestItem } from './ApprovalRequestItem';
import { ClinicalDraftItem } from './ClinicalDraftItem';

interface ClinicalTranscriptProps {
  threadId: string;
  items: ClinicalTranscriptItem[];
  emptyState?: ReactNode;
  onDraftChange: (id: string, draft: ClinicalDraft) => void;
  onDraftSourceChange: (id: string, sourceNote: string) => void;
  onDraftDateChange: (id: string, evolutionAt: string) => void;
  onDraftRegenerate: (item: DraftItemData) => void;
  onPrepare: (item: DraftItemData) => void;
  onResolve: (item: ApprovalItemData, decision: 'approve' | 'decline') => void;
  onRetry: (turnId: string) => void;
  busy?: boolean;
  preparingDraftId?: string | null;
  autoOpenApprovalId?: string | null;
}

function groupByTurn(items: ClinicalTranscriptItem[]): ClinicalTranscriptItem[][] {
  const groups = new Map<string, ClinicalTranscriptItem[]>();
  for (const item of items) {
    const group = groups.get(item.turnId) ?? [];
    group.push(item);
    groups.set(item.turnId, group);
  }
  return [...groups.values()];
}

export function ClinicalTranscript({
  threadId,
  items,
  emptyState,
  onDraftChange,
  onDraftSourceChange,
  onDraftDateChange,
  onDraftRegenerate,
  onPrepare,
  onResolve,
  onRetry,
  busy = false,
  preparingDraftId = null,
  autoOpenApprovalId = null,
}: ClinicalTranscriptProps) {
  const follow = useChatAutoFollow();
  const viewport = useConversationViewportCache({
    conversationId: threadId,
    scrollContainerRef: follow.scrollContainerRef,
    isFollowingLatest: follow.isFollowingLatest,
  });
  const { restoreViewport } = viewport;

  const latestItem = items[items.length - 1];
  const showThinking = busy && latestItem?.type === 'user';
  const latestContentRevision =
    latestItem?.type === 'assistant'
      ? latestItem.content.length
      : latestItem?.type === 'activity'
        ? latestItem.label
        : latestItem?.type === 'result' || latestItem?.type === 'error'
          ? latestItem.message
          : '';
  const followRevision = [
    items.length,
    latestItem?.id ?? '',
    latestItem?.status ?? '',
    latestContentRevision,
  ].join(':');

  useLayoutEffect(() => {
    if (latestItem?.type === 'user') {
      const container = follow.scrollContainerRef.current;
      const turn = container?.querySelector<HTMLElement>(`[data-turn-id="${latestItem.turnId}"]`);
      if (container && turn) {
        container.scrollTo({ top: Math.max(0, turn.offsetTop - 24), behavior: 'smooth' });
      }
      return;
    }
    follow.onContentAppended();
  }, [follow.followLatest, follow.onContentAppended, followRevision, latestItem?.type]);

  useEffect(() => {
    const cached = restoreViewport(threadId);
    if (!cached || !follow.scrollContainerRef.current) return;
    follow.scrollContainerRef.current.scrollTop = cached.scrollTop;
    follow.restoreFollowMode(cached.wasFollowingLatest ? 'following' : 'history');
  }, [follow.restoreFollowMode, follow.scrollContainerRef, restoreViewport, threadId]);

  return (
    <div
      ref={follow.scrollContainerRef}
      onScroll={follow.onScroll}
      className="chat-message-scroll clinical-transcript"
      role="log"
      aria-label="Transcripción clínica"
      aria-busy={busy}
    >
      {items.length === 0 && emptyState ? (
        emptyState
      ) : (
        <div className="chat-message-stack clinical-transcript-stack">
          {groupByTurn(items).map((group) => (
            <section
              key={group[0]?.turnId}
              className="clinical-turn-group"
              data-turn-id={group[0]?.turnId}
            >
              {group.map((item) => {
                if (item.type === 'user' || item.type === 'assistant')
                  return <Message key={item.id} role={item.type} content={item.content} />;
                if (item.type === 'activity')
                  return (
                    <div
                      key={item.id}
                      className={`clinical-activity clinical-activity--${
                        item.status === 'pending' || item.status === 'running'
                          ? 'active'
                          : item.status
                      }`}
                      role="status"
                      aria-live="polite"
                    >
                      {item.status === 'running' || item.status === 'pending' ? (
                        <Spinner />
                      ) : item.status === 'failed' || item.status === 'declined' ? (
                        <CircleX aria-hidden="true" size={14} strokeWidth={1.8} />
                      ) : (
                        <Check aria-hidden="true" size={14} strokeWidth={1.8} />
                      )}
                      <span>{item.label}</span>
                    </div>
                  );
                if (item.type === 'draft')
                  return (
                    <ClinicalDraftItem
                      key={item.id}
                      item={item}
                      onChange={(draft) => onDraftChange(item.id, draft)}
                      onSourceChange={(sourceNote) => onDraftSourceChange(item.id, sourceNote)}
                      onEvolutionAtChange={(evolutionAt) => onDraftDateChange(item.id, evolutionAt)}
                      onRegenerate={() => onDraftRegenerate(item)}
                      onPrepare={() => onPrepare(item)}
                      preparing={preparingDraftId === item.id}
                    />
                  );
                if (item.type === 'approval')
                  return (
                    <ApprovalRequestItem
                      key={item.id}
                      item={item}
                      onResolve={(decision) => onResolve(item, decision)}
                      autoOpen={autoOpenApprovalId === item.id}
                    />
                  );
                if (item.type === 'result')
                  return (
                    <output key={item.id} className="clinical-result">
                      <strong>{item.message}</strong>
                      {item.evolutionId && item.patientId && (
                        <Link to={`/patients/${item.patientId}/evolutions/${item.evolutionId}`}>
                          Ver en ficha
                        </Link>
                      )}
                    </output>
                  );
                return (
                  <div key={item.id} className="clinical-error" role="alert">
                    <span>{item.message}</span>
                    <button
                      type="button"
                      className="clinical-secondary-button"
                      onClick={() => onRetry(item.turnId)}
                    >
                      Reintentar
                    </button>
                  </div>
                );
              })}
            </section>
          ))}
          {showThinking && (
            <div
              className="clinical-thinking"
              role="status"
              aria-live="polite"
              aria-label="El asistente está preparando una respuesta"
            >
              Pensando…
            </div>
          )}
        </div>
      )}
      <div ref={follow.bottomSentinelRef} className="clinical-bottom-sentinel" />
      {follow.hasNewContentBelow && (
        <button
          type="button"
          className="chat-jump-to-bottom clinical-jump"
          onClick={follow.jumpToLatest}
        >
          ↓ Ir al mensaje más reciente
        </button>
      )}
    </div>
  );
}

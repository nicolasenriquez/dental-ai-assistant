import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useChatAutoFollow } from '../../hooks/useChatAutoFollow';
import { useConversationViewportCache } from '../../hooks/useConversationViewportCache';
import type {
  ClinicalApprovalItem as ApprovalItemData,
  ClinicalDraftItem as DraftItemData,
  ClinicalTranscriptItem,
} from '../../hooks/useClinicalAssistant';
import type { ClinicalDraft } from '../../lib/api';
import { ApprovalRequestItem } from './ApprovalRequestItem';
import { ClinicalDraftItem } from './ClinicalDraftItem';

interface ClinicalTranscriptProps {
  threadId: string;
  items: ClinicalTranscriptItem[];
  onDraftChange: (id: string, draft: ClinicalDraft) => void;
  onDraftSourceChange: (id: string, sourceNote: string) => void;
  onDraftRegenerate: (item: DraftItemData) => void;
  onPrepare: (item: DraftItemData) => void;
  onResolve: (item: ApprovalItemData, decision: 'approve' | 'decline') => void;
}

export function ClinicalTranscript({ threadId, items, onDraftChange, onDraftSourceChange, onDraftRegenerate, onPrepare, onResolve }: ClinicalTranscriptProps) {
  const follow = useChatAutoFollow();
  const viewport = useConversationViewportCache({
    conversationId: threadId,
    scrollContainerRef: follow.scrollContainerRef,
    isFollowingLatest: follow.isFollowingLatest,
  });
  const { restoreViewport } = viewport;

  useEffect(() => {
    follow.onContentAppended();
  }, [follow.onContentAppended, items.length]);

  useEffect(() => {
    const cached = restoreViewport(threadId);
    if (!cached || !follow.scrollContainerRef.current) return;
    follow.scrollContainerRef.current.scrollTop = cached.scrollTop;
    follow.restoreFollowMode(cached.wasFollowingLatest ? 'following' : 'history');
  }, [follow.restoreFollowMode, follow.scrollContainerRef, restoreViewport, threadId]);

  return (
    <div ref={follow.scrollContainerRef} onScroll={follow.onScroll} className="clinical-transcript" aria-label="Transcripción clínica">
      <div className="clinical-transcript-stack">
        {items.map((item) => {
          if (item.type === 'user') return <div key={item.id} className="clinical-user-message">{item.content}</div>;
          if (item.type === 'assistant') return <p key={item.id} className="clinical-assistant-message">{item.content}</p>;
          if (item.type === 'activity') return <div key={item.id} className="clinical-activity" role="status" aria-live="polite"><span className={item.status === 'running' ? 'clinical-activity-icon clinical-activity-icon--running' : 'clinical-activity-icon'} aria-hidden="true">{item.status === 'running' ? '○' : '✓'}</span><span>{item.label}{item.status === 'running' ? '…' : ''}</span></div>;
          if (item.type === 'draft') return <ClinicalDraftItem key={item.id} item={item} onChange={(draft) => onDraftChange(item.id, draft)} onSourceChange={(sourceNote) => onDraftSourceChange(item.id, sourceNote)} onRegenerate={() => onDraftRegenerate(item)} onPrepare={() => onPrepare(item)} />;
          if (item.type === 'approval') return <ApprovalRequestItem key={item.id} item={item} onResolve={(decision) => onResolve(item, decision)} />;
          if (item.type === 'result') return <output key={item.id} className="clinical-result"><strong>{item.message}</strong>{item.evolutionId && item.patientId && <Link to={`/patients/${item.patientId}/evolutions/${item.evolutionId}`}>Ver en ficha</Link>}</output>;
          return <p key={item.id} className="clinical-error" role="alert">{item.message}</p>;
        })}
        <div ref={follow.bottomSentinelRef} className="clinical-bottom-sentinel" />
      </div>
      {follow.hasNewContentBelow && <button type="button" className="clinical-jump" onClick={follow.jumpToLatest}>↓ Nuevo contenido</button>}
    </div>
  );
}

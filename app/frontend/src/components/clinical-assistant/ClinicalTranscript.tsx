import { useEffect, useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motionSafeScrollBehavior, useChatAutoFollow } from '../../hooks/useChatAutoFollow';
import type {
  ClinicalApprovalItem as ApprovalItemData,
  ClinicalTranscriptItem,
  ClinicalDraftItem as DraftItemData,
} from '../../hooks/useClinicalAssistant';
import { useConversationViewportCache } from '../../hooks/useConversationViewportCache';
import type { ClinicalDraft, ClinicalPatient, DriveJournalTarget } from '../../lib/api';
import { Message } from '../Message';
import { ApprovalRequestItem } from './ApprovalRequestItem';
import { ClinicalDraftItem } from './ClinicalDraftItem';
import { ClinicalPatientSwitchItem } from './ClinicalPatientSwitchItem';
import { type ActiveClinicalTurn, ClinicalTurnProgress } from './ClinicalTurnProgress';

type ResultItemData = Extract<ClinicalTranscriptItem, { type: 'result' }>;

function draftForApproval(
  group: ClinicalTranscriptItem[],
  approval: ApprovalItemData,
): DraftItemData | undefined {
  return group.find(
    (candidate): candidate is DraftItemData =>
      candidate.type === 'draft' && candidate.id === approval.action.artifact_id,
  );
}

function approvalForResult(
  group: ClinicalTranscriptItem[],
  result: ResultItemData,
): ApprovalItemData | undefined {
  return group.find(
    (candidate): candidate is ApprovalItemData =>
      candidate.type === 'approval' && candidate.id === result.actionId,
  );
}

interface ClinicalTranscriptProps {
  threadId: string;
  items: ClinicalTranscriptItem[];
  emptyState?: ReactNode;
  onDraftChange: (id: string, draft: ClinicalDraft) => void;
  onDraftSourceChange: (id: string, sourceNote: string) => Promise<boolean>;
  onDraftDateChange: (id: string, evolutionAt: string) => void;
  onDraftRegenerate: (item: DraftItemData) => void;
  onPrepare: (item: DraftItemData) => void;
  onResolve: (item: ApprovalItemData, decision: 'approve' | 'decline') => void;
  onBackToEdit: (item: ApprovalItemData) => void;
  onRetry: (turnId: string) => void;
  busy?: boolean;
  activeTurn?: ActiveClinicalTurn | null;
  preparingDraftId?: string | null;
  autoOpenApprovalId?: string | null;
  artifactSyncState?: Record<string, 'idle' | 'saving' | 'saved' | 'error'>;
  onRetryArtifactSync?: (item: DraftItemData) => void;
  onSaveToDrive?: (item: Extract<ClinicalTranscriptItem, { type: 'assistant' }>) => void;
  onSaveDraftToDrive?: (item: DraftItemData) => void;
  driveTransferDisabled?: boolean;
  activePatientId?: string | null;
  activePatient?: ClinicalPatient | null;
  onRecoverDriveExport?: (evolutionId: string) => void;
  onReconnectDrive?: () => void;
  onOpenDriveJournal?: (target: DriveJournalTarget) => void;
  onKeepPatient?: (itemId: string) => void;
  onChangePatient?: (item: Extract<ClinicalTranscriptItem, { type: 'patient_switch' }>) => void;
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
  onBackToEdit,
  onRetry,
  busy = false,
  activeTurn = null,
  preparingDraftId = null,
  autoOpenApprovalId = null,
  artifactSyncState = {},
  onRetryArtifactSync,
  onSaveToDrive,
  onSaveDraftToDrive,
  driveTransferDisabled = false,
  activePatientId = null,
  activePatient = null,
  onRecoverDriveExport,
  onReconnectDrive,
  onOpenDriveJournal,
  onKeepPatient,
  onChangePatient,
}: ClinicalTranscriptProps) {
  const follow = useChatAutoFollow();
  const viewport = useConversationViewportCache({
    conversationId: threadId,
    scrollContainerRef: follow.scrollContainerRef,
    isFollowingLatest: follow.isFollowingLatest,
  });
  const { restoreViewport } = viewport;

  // Activity labels and the progress clock are presentation-only. They must not
  // change the revision that drives transcript auto-follow.
  const followItems = items.filter((item) => item.type !== 'activity');
  const latestItem = followItems[followItems.length - 1];
  const groups = groupByTurn(items);
  const activeGroupExists = groups.some((group) => group[0]?.turnId === activeTurn?.turnId);
  const latestContentRevision =
    latestItem?.type === 'assistant'
      ? latestItem.content.length
      : latestItem?.type === 'result' || latestItem?.type === 'error'
        ? latestItem.message
        : '';
  const followRevision = [
    followItems.length,
    latestItem?.id ?? '',
    latestItem?.status ?? '',
    latestContentRevision,
  ].join(':');

  useLayoutEffect(() => {
    if (latestItem?.type === 'user') {
      const container = follow.scrollContainerRef.current;
      const turn = container?.querySelector<HTMLElement>(`[data-turn-id="${latestItem.turnId}"]`);
      if (container && turn) {
        container.scrollTo({
          top: Math.max(0, turn.offsetTop - 24),
          behavior: motionSafeScrollBehavior('smooth'),
        });
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
      {items.length === 0 && !activeTurn && emptyState ? (
        emptyState
      ) : (
        <div className="chat-message-stack clinical-transcript-stack">
          {groups.map((group) => (
            <section
              key={group[0]?.turnId}
              className="clinical-turn-group"
              data-turn-id={group[0]?.turnId}
            >
              {activeTurn?.turnId === group[0]?.turnId &&
                !group.some((item) => item.type === 'user') && (
                  <ClinicalTurnProgress key={activeTurn.turnId} turn={activeTurn} items={group} />
                )}
              {group.map((item) => {
                if (item.type === 'user')
                  return (
                    <div key={item.id}>
                      {item.contextItems && item.contextItems.length > 0 && (
                        <div
                          className="mb-2 flex flex-wrap justify-end gap-2"
                          aria-label="Fuentes adjuntas"
                        >
                          {item.contextItems.map((context) => (
                            <span
                              key={context.id}
                              className="rounded-md bg-surface-raised px-2 py-1 text-xs text-muted"
                            >
                              {context.sourceName} · selección
                            </span>
                          ))}
                        </div>
                      )}
                      <Message role={item.type} content={item.content} />
                      {activeTurn?.turnId === item.turnId && (
                        <ClinicalTurnProgress
                          key={activeTurn.turnId}
                          turn={activeTurn}
                          items={group}
                        />
                      )}
                    </div>
                  );
                if (item.type === 'assistant')
                  return (
                    <Message
                      key={item.id}
                      role={item.type}
                      content={item.content}
                      onSaveToDrive={
                        item.status === 'completed' && onSaveToDrive
                          ? () => onSaveToDrive(item)
                          : undefined
                      }
                      saveToDriveDisabled={driveTransferDisabled}
                    />
                  );
                if (item.type === 'activity') return null;
                if (item.type === 'patient_switch') {
                  return (
                    <ClinicalPatientSwitchItem
                      key={item.id}
                      item={item}
                      onKeep={() => onKeepPatient?.(item.id)}
                      onChange={() => onChangePatient?.(item)}
                    />
                  );
                }
                if (item.type === 'draft') {
                  const approval = group.find(
                    (candidate): candidate is ApprovalItemData =>
                      candidate.type === 'approval' && candidate.action.artifact_id === item.id,
                  );
                  const result = group.find(
                    (candidate): candidate is ResultItemData =>
                      candidate.type === 'result' && candidate.actionId === approval?.id,
                  );
                  return (
                    <ClinicalDraftItem
                      key={item.id}
                      item={item}
                      patient={
                        approval?.patient ??
                        (activePatient?.id === item.patientId ? activePatient : undefined)
                      }
                      approval={approval}
                      result={result}
                      onChange={(draft) => onDraftChange(item.id, draft)}
                      onSourceChange={(sourceNote) => onDraftSourceChange(item.id, sourceNote)}
                      onEvolutionAtChange={(evolutionAt) => onDraftDateChange(item.id, evolutionAt)}
                      onRegenerate={() => onDraftRegenerate(item)}
                      onPrepare={() => onPrepare(item)}
                      onResolve={onResolve}
                      onBackToEdit={onBackToEdit}
                      autoOpenApproval={autoOpenApprovalId === approval?.id}
                      preparing={preparingDraftId === item.id}
                      syncState={artifactSyncState[item.id]}
                      onRetrySync={() => onRetryArtifactSync?.(item)}
                      onSaveToDrive={
                        onSaveDraftToDrive ? () => onSaveDraftToDrive(item) : undefined
                      }
                      saveToDriveDisabled={
                        driveTransferDisabled || item.patientId !== activePatientId
                      }
                      onRecoverDriveExport={onRecoverDriveExport}
                      onReconnectDrive={onReconnectDrive}
                      onOpenDriveJournal={onOpenDriveJournal}
                    />
                  );
                }
                if (item.type === 'approval' && draftForApproval(group, item)) return null;
                if (item.type === 'approval')
                  return (
                    <ApprovalRequestItem
                      key={item.id}
                      item={item}
                      onResolve={(decision) => onResolve(item, decision)}
                      onBackToEdit={() => onBackToEdit(item)}
                      autoOpen={autoOpenApprovalId === item.id}
                    />
                  );
                if (item.type === 'result') {
                  const approval = approvalForResult(group, item);
                  if (approval && draftForApproval(group, approval)) return null;
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
                }
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
          {activeTurn && !activeGroupExists && (
            <section className="clinical-turn-group" data-turn-id={activeTurn.turnId}>
              <ClinicalTurnProgress key={activeTurn.turnId} turn={activeTurn} items={[]} />
            </section>
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

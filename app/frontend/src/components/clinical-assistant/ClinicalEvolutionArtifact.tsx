import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ClinicalResultItem } from '../../hooks/clinicalRuntime';
import type { ClinicalApprovalItem, ClinicalDraftItem } from '../../hooks/useClinicalAssistant';
import {
  type ClinicalArtifactStage,
  EvolutionReviewArtifact,
} from '../clinical/EvolutionReviewArtifact';
import { composeClinicalDraft } from '../clinical/evolutionFields';
import { ApprovalRequestItem } from './ApprovalRequestItem';

interface ClinicalEvolutionArtifactProps {
  item: ClinicalDraftItem;
  approval?: ClinicalApprovalItem;
  result?: ClinicalResultItem;
  onChange: (draft: ClinicalDraftItem['draft']) => void;
  onSourceChange: (sourceNote: string) => Promise<boolean>;
  onEvolutionAtChange: (evolutionAt: string) => void;
  onRegenerate: () => void;
  onPrepare: () => void;
  onResolve?: (item: ClinicalApprovalItem, decision: 'approve' | 'decline') => void;
  onBackToEdit?: (item: ClinicalApprovalItem) => void;
  preparing?: boolean;
  syncState?: 'idle' | 'saving' | 'saved' | 'error';
  onRetrySync?: () => void;
  onSaveToDrive?: () => void;
  saveToDriveDisabled?: boolean;
  autoOpenApproval?: boolean;
}

function artifactStage(
  item: ClinicalDraftItem,
  approval: ClinicalApprovalItem | undefined,
  result: ClinicalResultItem | undefined,
): ClinicalArtifactStage {
  if (approval?.status === 'running' || item.status === 'running') return 'saving';
  if (approval?.status === 'completed' || result || item.artifactStatus === 'approved')
    return 'saved';
  if (approval?.status === 'pending' || item.artifactStatus === 'pending') return 'review';
  return 'draft';
}

function isLocked(item: ClinicalDraftItem, approval?: ClinicalApprovalItem): boolean {
  return (
    Boolean(approval) ||
    item.status === 'pending' ||
    item.status === 'running' ||
    item.artifactStatus === 'pending' ||
    item.artifactStatus === 'approved' ||
    item.artifactStatus === 'declined' ||
    item.artifactStatus === 'failed'
  );
}

function ArtifactOverflow({
  content,
  onSaveToDrive,
  saveToDriveDisabled,
}: {
  content: string;
  onSaveToDrive?: () => void;
  saveToDriveDisabled: boolean;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(content);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  };

  return (
    <details className="clinical-artifact-overflow">
      <summary>Más acciones</summary>
      <div className="clinical-artifact-overflow__menu">
        <button type="button" onClick={() => void copy()}>
          {copyState === 'copied' ? 'Copiado' : 'Copiar'}
        </button>
        {onSaveToDrive && (
          <button type="button" onClick={onSaveToDrive} disabled={saveToDriveDisabled}>
            Guardar en Drive
          </button>
        )}
      </div>
      {copyState === 'error' && (
        <span className="clinical-artifact-overflow__status" role="status">
          No pudimos copiar la evolución.
        </span>
      )}
    </details>
  );
}

export function ClinicalEvolutionArtifact({
  item,
  approval,
  result,
  onChange,
  onSourceChange,
  onEvolutionAtChange,
  onRegenerate,
  onPrepare,
  onResolve,
  onBackToEdit,
  preparing = false,
  syncState = 'idle',
  onRetrySync,
  onSaveToDrive,
  saveToDriveDisabled = false,
  autoOpenApproval = false,
}: ClinicalEvolutionArtifactProps) {
  const locked = isLocked(item, approval);
  const stage = artifactStage(item, approval, result);
  const resourceId = approval?.action.result_resource_id ?? result?.evolutionId ?? null;
  const resourcePatientId = approval?.action.patient_id ?? result?.patientId ?? item.patientId;
  const terminalApproval = approval?.status === 'declined' || approval?.status === 'failed';
  const clinicalContent = composeClinicalDraft(item.draft);
  const showOverflow = stage !== 'saving';

  return (
    <article
      className="clinical-artifact"
      data-artifact-id={item.id}
      data-clinical-stage={stage}
      tabIndex={-1}
      aria-label="Evolución clínica"
    >
      <EvolutionReviewArtifact
        mode="assistant"
        embedded
        sourceNote={item.sourceNote}
        draft={item.draft}
        generatedDraft={item.baseline}
        evolutionAt={item.evolutionAt}
        stale={item.stale}
        edited={item.edited}
        readOnly={locked}
        sourceEditable
        onChange={onChange}
        onSourceChange={onSourceChange}
        onEvolutionAtChange={onEvolutionAtChange}
        onRegenerate={onRegenerate}
        onPrepare={approval || terminalApproval ? undefined : onPrepare}
        preparing={preparing}
        lifecycleStage={stage}
        showAssistantActions={stage === 'draft' && !terminalApproval}
        syncState={syncState}
        onRetrySync={onRetrySync}
      />

      {stage === 'draft' && !terminalApproval && showOverflow && (
        <div className="clinical-artifact-utility-row">
          <ArtifactOverflow
            content={clinicalContent}
            onSaveToDrive={onSaveToDrive}
            saveToDriveDisabled={saveToDriveDisabled}
          />
        </div>
      )}

      {stage === 'review' && approval && (
        <div className="clinical-artifact-review-actions">
          <ApprovalRequestItem
            item={approval}
            embedded
            onResolve={(decision) => onResolve?.(approval, decision)}
            onBackToEdit={() => onBackToEdit?.(approval)}
            autoOpen={autoOpenApproval}
          />
          {showOverflow && (
            <ArtifactOverflow content={clinicalContent} saveToDriveDisabled={saveToDriveDisabled} />
          )}
        </div>
      )}

      {stage === 'saving' && approval && (
        <ApprovalRequestItem
          item={approval}
          embedded
          onResolve={(decision) => onResolve?.(approval, decision)}
          onBackToEdit={() => onBackToEdit?.(approval)}
          autoOpen={autoOpenApproval}
        />
      )}

      {stage === 'saved' && (
        <>
          {onSaveToDrive && (
            <div className="clinical-drive-row" data-drive-export="manual" role="status">
              <span>Drive</span>
              <button
                type="button"
                className="clinical-secondary-button"
                onClick={onSaveToDrive}
                disabled={saveToDriveDisabled}
              >
                Guardar en Drive
              </button>
            </div>
          )}
          <div className="clinical-artifact-terminal-actions">
            {resourceId && resourcePatientId && (
              <Link
                className="clinical-primary-button"
                to={`/patients/${resourcePatientId}/evolutions/${resourceId}`}
              >
                Ver en ficha <ChevronRight aria-hidden="true" size={15} />
              </Link>
            )}
            {showOverflow && (
              <ArtifactOverflow
                content={clinicalContent}
                saveToDriveDisabled={saveToDriveDisabled}
              />
            )}
          </div>
        </>
      )}

      {terminalApproval && approval && (
        <ApprovalRequestItem
          item={approval}
          embedded
          onResolve={(decision) => onResolve?.(approval, decision)}
          onBackToEdit={() => onBackToEdit?.(approval)}
          autoOpen={autoOpenApproval}
        />
      )}
    </article>
  );
}

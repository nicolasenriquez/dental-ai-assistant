import { useEffect } from 'react';
import type { ClinicalResultItem } from '../../hooks/clinicalRuntime';
import type {
  ClinicalApprovalItem,
  ClinicalDraftItem as DraftItemData,
} from '../../hooks/useClinicalAssistant';
import type { ClinicalDraft } from '../../lib/api';
import { clinicalTrace } from '../../lib/clinicalTelemetry';
import { ClinicalEvolutionArtifact } from './ClinicalEvolutionArtifact';

interface ClinicalDraftItemProps {
  item: DraftItemData;
  onChange: (draft: ClinicalDraft) => void;
  onSourceChange: (sourceNote: string) => Promise<boolean>;
  onEvolutionAtChange: (evolutionAt: string) => void;
  onRegenerate: () => void;
  onPrepare: () => void;
  preparing?: boolean;
  syncState?: 'idle' | 'saving' | 'saved' | 'error';
  onRetrySync?: () => void;
  onSaveToDrive?: () => void;
  saveToDriveDisabled?: boolean;
  approval?: ClinicalApprovalItem;
  result?: ClinicalResultItem;
  onResolve?: (item: ClinicalApprovalItem, decision: 'approve' | 'decline') => void;
  onBackToEdit?: (item: ClinicalApprovalItem) => void;
  autoOpenApproval?: boolean;
}

export function ClinicalDraftItem({
  item,
  onChange,
  onSourceChange,
  onEvolutionAtChange,
  onRegenerate,
  onPrepare,
  preparing = false,
  syncState = 'idle',
  onRetrySync,
  onSaveToDrive,
  saveToDriveDisabled = false,
  approval,
  result,
  onResolve,
  onBackToEdit,
  autoOpenApproval = false,
}: ClinicalDraftItemProps) {
  useEffect(() => {
    clinicalTrace('clinical.artifact.rendered', {
      turn_id: item.turnId,
      item_id: item.id,
      item_type: 'clinical_draft',
      status: item.artifactStatus ?? item.status,
    });
  }, [item.artifactStatus, item.id, item.status, item.turnId]);

  return (
    <ClinicalEvolutionArtifact
      item={item}
      approval={approval}
      result={result}
      onChange={onChange}
      onSourceChange={onSourceChange}
      onEvolutionAtChange={onEvolutionAtChange}
      onRegenerate={onRegenerate}
      onPrepare={onPrepare}
      onResolve={onResolve}
      onBackToEdit={onBackToEdit}
      preparing={preparing}
      syncState={syncState}
      onRetrySync={onRetrySync}
      onSaveToDrive={onSaveToDrive}
      saveToDriveDisabled={saveToDriveDisabled}
      autoOpenApproval={autoOpenApproval}
    />
  );
}

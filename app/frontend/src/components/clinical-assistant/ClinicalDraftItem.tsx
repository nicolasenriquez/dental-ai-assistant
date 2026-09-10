import { useEffect } from 'react';
import type { ClinicalDraftItem as DraftItemData } from '../../hooks/useClinicalAssistant';
import type { ClinicalDraft } from '../../lib/api';
import { clinicalTrace } from '../../lib/clinicalTelemetry';
import { EvolutionReviewArtifact } from '../clinical/EvolutionReviewArtifact';

interface ClinicalDraftItemProps {
  item: DraftItemData;
  onChange: (draft: ClinicalDraft) => void;
  onSourceChange: (sourceNote: string) => void;
  onEvolutionAtChange: (evolutionAt: string) => void;
  onRegenerate: () => void;
  onPrepare: () => void;
  preparing?: boolean;
}

export function ClinicalDraftItem({
  item,
  onChange,
  onSourceChange,
  onEvolutionAtChange,
  onRegenerate,
  onPrepare,
  preparing = false,
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
    <EvolutionReviewArtifact
      mode="assistant"
      sourceNote={item.sourceNote}
      draft={item.draft}
      generatedDraft={item.baseline}
      evolutionAt={item.evolutionAt}
      stale={item.stale}
      edited={item.edited}
      readOnly={
        item.artifactStatus === 'pending' ||
        item.artifactStatus === 'approved' ||
        item.artifactStatus === 'declined' ||
        item.artifactStatus === 'failed'
      }
      sourceEditable
      onChange={onChange}
      onSourceChange={onSourceChange}
      onEvolutionAtChange={onEvolutionAtChange}
      onRegenerate={onRegenerate}
      onPrepare={onPrepare}
      preparing={preparing}
    />
  );
}

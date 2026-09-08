import type { ClinicalDraftItem as DraftItemData } from '../../hooks/useClinicalAssistant';
import type { ClinicalDraft } from '../../lib/api';
import { EvolutionReviewArtifact } from '../clinical/EvolutionReviewArtifact';

interface ClinicalDraftItemProps {
  item: DraftItemData;
  onChange: (draft: ClinicalDraft) => void;
  onSourceChange: (sourceNote: string) => void;
  onEvolutionAtChange: (evolutionAt: string) => void;
  onRegenerate: () => void;
  onPrepare: () => void;
}

export function ClinicalDraftItem({
  item,
  onChange,
  onSourceChange,
  onEvolutionAtChange,
  onRegenerate,
  onPrepare,
}: ClinicalDraftItemProps) {
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
    />
  );
}

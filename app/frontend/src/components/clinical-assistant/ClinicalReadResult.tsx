import type { ClinicalReadResult as ReadResult } from '../../lib/api';
import { EvolutionListResult } from './EvolutionListResult';
import { TerminologyEvidenceResult } from './TerminologyEvidenceResult';

const renderers: Record<string, (props: { payload: Record<string, unknown> }) => JSX.Element> = {
  evolution_list: EvolutionListResult,
  terminology_evidence: TerminologyEvidenceResult,
};

export function ClinicalReadResult({
  result,
  fallback,
}: { result: ReadResult; fallback: string }): JSX.Element {
  const Renderer = renderers[result.result_kind];
  return (
    <div className="rounded-lg border border-border p-4">
      {Renderer ? <Renderer payload={result.payload} /> : <p>{fallback}</p>}
    </div>
  );
}

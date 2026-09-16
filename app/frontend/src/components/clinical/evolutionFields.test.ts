import { describe, expect, it } from 'vitest';

import type { ClinicalDraft } from '../../lib/api';
import { composeClinicalDraft, parseClinicalText } from './evolutionFields';

describe('Evolucion text representation', () => {
  it('round-trips populated clinical fields', () => {
    const draft: ClinicalDraft = {
      context: 'Consulta por dolor.',
      findings: 'Sensibilidad localizada.',
      assessment: '',
      treatment: '',
      follow_up: 'Control en siete días.',
      review_flags: [],
    };

    expect(parseClinicalText(composeClinicalDraft(draft)).sections).toEqual({
      context: draft.context,
      findings: draft.findings,
      follow_up: draft.follow_up,
    });
  });
});

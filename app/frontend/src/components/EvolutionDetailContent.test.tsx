import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { formatClinicalDateTime } from '../lib/clinicalDate';
import { EvolutionDetailContent } from './EvolutionDetailContent';

it('uses the shared abbreviated timestamp and retains the original datetime', () => {
  const evolution = {
    id: 'e',
    patient_id: 'p',
    evolution_at: '2026-10-05T19:38:30Z',
    created_at: '2026-10-05T19:38:30Z',
    final_text: 'Hallazgos: Prueba',
  };
  render(<EvolutionDetailContent evolution={evolution} />);
  expect(screen.getByText(formatClinicalDateTime(evolution.evolution_at))).toHaveAttribute(
    'datetime',
    evolution.evolution_at,
  );
});

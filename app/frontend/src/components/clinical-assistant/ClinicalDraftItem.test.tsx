import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ClinicalDraftItem as DraftItemData } from '../../hooks/useClinicalAssistant';
import { ClinicalDraftItem } from './ClinicalDraftItem';

it('does not allow editing while its save approval is pending', () => {
  const draft = {
    context: 'Control',
    findings: '',
    assessment: '',
    treatment: '',
    follow_up: '',
    review_flags: [],
  };
  const item: DraftItemData = {
    id: 'artifact-1',
    turnId: 'turn-1',
    status: 'pending',
    createdAt: '2026-09-09T12:00:00Z',
    type: 'draft',
    artifactStatus: 'pending',
    draft,
    baseline: draft,
    sourceNote: 'Control',
    edited: false,
    stale: false,
    patientId: 'patient-1',
    evolutionAt: '2026-09-09T12:00:00Z',
  };

  render(
    <ClinicalDraftItem
      item={item}
      onChange={vi.fn()}
      onSourceChange={vi.fn()}
      onEvolutionAtChange={vi.fn()}
      onRegenerate={vi.fn()}
      onPrepare={vi.fn()}
    />,
  );

  expect(screen.queryByRole('button', { name: /^Editar / })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar nota original' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Preparar para guardar' })).not.toBeInTheDocument();
});

it('shows all clinical fields and keeps the source note collapsed', () => {
  const draft = {
    context: 'Control',
    findings: 'Sin hallazgos',
    assessment: 'Estable',
    treatment: 'Mantener higiene',
    follow_up: 'Control en seis meses',
    review_flags: [],
  };
  const item: DraftItemData = {
    id: 'artifact-1',
    turnId: 'turn-1',
    status: 'completed',
    createdAt: '2026-09-09T12:00:00Z',
    type: 'draft',
    artifactStatus: 'draft',
    draft,
    baseline: draft,
    sourceNote: 'Control',
    edited: false,
    stale: false,
    patientId: 'patient-1',
    evolutionAt: '2026-09-09T12:00:00Z',
  };

  render(
    <ClinicalDraftItem
      item={item}
      onChange={vi.fn()}
      onSourceChange={vi.fn()}
      onEvolutionAtChange={vi.fn()}
      onRegenerate={vi.fn()}
      onPrepare={vi.fn()}
    />,
  );

  expect(screen.getByText('Mantener higiene')).toBeVisible();
  expect(screen.getByText('Control en seis meses')).toBeVisible();
  expect(screen.queryByText('Control', { selector: 'blockquote' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ver nota clínica original' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PatientClinicalPlanHistory } from './PatientClinicalPlanHistory';

const mocks = vi.hoisted(() => ({ detail: vi.fn(), history: vi.fn() }));
vi.mock('../../lib/api', () => ({
  getClinicalPlan: mocks.detail,
  getClinicalPlanRevisions: mocks.history,
}));
afterEach(() => vi.resetAllMocks());

it('renders saved anatomy and notes from each snapshot without substituting current evidence', async () => {
  const items = (tooth: number, note: string) => [
    {
      id: 'bridge',
      treatment: {
        label_es: 'Puente',
        arch: null,
        teeth: [
          { tooth_fdi: tooth, role: 'pillar', surfaces: ['M', 'O'] },
          { tooth_fdi: tooth + 1, role: 'pontic', surfaces: [] },
        ],
        note,
      },
      stages: [{ id: 'stage', label: 'Sesión', status: 'completed', note: `Sesión ${note}` }],
    },
    {
      id: 'arch',
      treatment: { label_es: 'Férula', arch: 'upper', teeth: [], note: null },
      stages: [{ id: 'arch-stage', label: 'Adaptación', status: 'pending', note: null }],
    },
  ];
  mocks.detail.mockResolvedValue({ title: 'Plan anterior', items: items(16, 'Actual') });
  mocks.history.mockResolvedValue({
    items: [{ id: 'r', after: { revision: 2, items: items(14, 'Histórica') } }],
    next_cursor: null,
  });
  render(<PatientClinicalPlanHistory patientId="patient" planId="plan" />);
  expect(await screen.findByText('Puente · Piezas 16, 17')).toBeVisible();
  expect(screen.getByText('16 (Pilar) · M, O; 17 (Póntico) · Pieza completa')).toBeVisible();
  expect(screen.getByText('Actual')).toBeVisible();
  expect(screen.getByText('Sesión Actual')).toBeVisible();
  const revision = within(screen.getByText('Revisión 2').closest('li') as HTMLLIElement);
  expect(revision.getByText('Puente · Piezas 14, 15')).toBeVisible();
  expect(revision.getByText('14 (Pilar) · M, O; 15 (Póntico) · Pieza completa')).toBeVisible();
  expect(revision.getByText('Histórica')).toBeVisible();
  expect(revision.getByText('Sesión Histórica')).toBeVisible();
  expect(revision.getByText('Férula · Arcada superior')).toBeVisible();
  expect(revision.queryByText('Actual')).not.toBeInTheDocument();
  expect(screen.getAllByText('Férula · Arcada superior')).toHaveLength(2);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('keeps old plan evidence readable without an authoring command', async () => {
  mocks.detail.mockResolvedValue({
    title: 'Plan anterior',
    diagnosis: 'Diagnóstico conservado',
    internal_notes: 'Nota anterior',
    items: [],
  });
  mocks.history.mockResolvedValue({
    items: [
      {
        id: 'r',
        after: { revision: 2, diagnosis: 'Evidencia histórica', internal_notes: '', items: [] },
      },
    ],
    next_cursor: null,
  });
  render(<PatientClinicalPlanHistory patientId="patient" planId="plan" />);
  expect(await screen.findByText('Diagnóstico conservado')).toBeVisible();
  expect(screen.getByText('Evidencia histórica')).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Crear|Guardar|Confirmar/ })).not.toBeInTheDocument();
  await waitFor(() => expect(mocks.detail).toHaveBeenCalledWith('patient', 'plan'));
});

it('focuses the exact plan destination once after the owned read, never on later pagination', async () => {
  mocks.detail.mockResolvedValue({
    title: 'Plan anterior',
    diagnosis: 'Diagnóstico conservado',
    internal_notes: null,
    items: [],
  });
  mocks.history.mockResolvedValue({
    items: [
      {
        id: 'r',
        after: { revision: 2, diagnosis: 'Evidencia histórica', internal_notes: '', items: [] },
      },
    ],
    next_cursor: 'next',
  });
  render(<PatientClinicalPlanHistory patientId="patient" planId="plan" />);
  const destination = await screen.findByRole('region', { name: 'Historial de plan clínico' });
  await waitFor(() => {
    expect(destination).toHaveFocus();
  });
  expect(mocks.detail).toHaveBeenCalledWith('patient', 'plan');
  const more = screen.getByRole('button', { name: 'Cargar más revisiones' });
  more.focus();
  fireEvent.click(more);
  await waitFor(() => expect(mocks.history).toHaveBeenCalledTimes(2));
  expect(more).toHaveFocus();
});

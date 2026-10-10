import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PatientClinicalPlanHistory } from './PatientClinicalPlanHistory';

const mocks = vi.hoisted(() => ({ detail: vi.fn(), history: vi.fn() }));
vi.mock('../../lib/api', () => ({
  getClinicalPlan: mocks.detail,
  getClinicalPlanRevisions: mocks.history,
}));
afterEach(() => vi.resetAllMocks());

it('keeps old plan evidence readable without an authoring command', async () => {
  mocks.detail.mockResolvedValue({
    title: 'Plan anterior',
    diagnosis: 'Diagnóstico conservado',
    internal_notes: 'Nota anterior',
    items: [],
  });
  mocks.history.mockResolvedValue({
    items: [
      { id: 'r', after: { revision: 2, diagnosis: 'Evidencia histórica', internal_notes: '' } },
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
      { id: 'r', after: { revision: 2, diagnosis: 'Evidencia histórica', internal_notes: '' } },
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

import { render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PatientClinicalPlanHistory } from './PatientClinicalPlanHistory';

const mocks = vi.hoisted(() => ({ detail: vi.fn(), history: vi.fn() }));
vi.mock('../../lib/api', () => ({
  getClinicalPlan: mocks.detail,
  getClinicalPlanRevisions: mocks.history,
}));

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

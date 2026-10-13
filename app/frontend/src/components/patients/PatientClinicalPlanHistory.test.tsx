import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PatientClinicalPlanHistory } from './PatientClinicalPlanHistory';

const mocks = vi.hoisted(() => ({ detail: vi.fn(), history: vi.fn() }));
vi.mock('../../lib/api', () => ({
  getClinicalPlan: mocks.detail,
  getClinicalPlanRevisions: mocks.history,
}));
afterEach(() => vi.resetAllMocks());

it.each(['plan', 'patient', 'return'])(
  'ignores stale pagination after a %s change and preserves the current cursor',
  async (change) => {
    mocks.detail.mockImplementation(async (_patient: string, id: string) => ({
      id,
      title: `Plan ${id}`,
      items: [],
    }));
    const page = (diagnosis: string, next_cursor: string | null) => ({
      items: [{ id: diagnosis, after: { revision: 2, diagnosis, items: [] } }],
      next_cursor,
    });
    let resolve!: (value: ReturnType<typeof page>) => void;
    const pending = new Promise<ReturnType<typeof page>>((done) => {
      resolve = done;
    });
    mocks.history
      .mockResolvedValueOnce(page('Original', 'old-cursor'))
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(page('Current', 'current-cursor'));
    if (change === 'return') mocks.history.mockResolvedValueOnce(page('Current', 'current-cursor'));
    mocks.history.mockResolvedValueOnce(page('Next', null));
    const { rerender } = render(<PatientClinicalPlanHistory patientId="patient" planId="a" />);
    const more = await screen.findByRole('button', { name: 'Cargar más revisiones' });
    fireEvent.click(more);
    const patientId = change === 'patient' ? 'other-patient' : 'patient';
    const planId = change === 'patient' ? 'a' : 'b';
    rerender(<PatientClinicalPlanHistory patientId={patientId} planId={planId} />);
    await screen.findByText('Current');
    if (change === 'return') {
      rerender(<PatientClinicalPlanHistory patientId="patient" planId="a" />);
      await screen.findByText('Plan a');
    }
    await act(async () => resolve(page('Stale evidence', 'stale-cursor')));
    expect(screen.queryByText('Stale evidence')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más revisiones' }));
    expect(mocks.history).toHaveBeenLastCalledWith(
      patientId,
      change === 'return' ? 'a' : planId,
      'current-cursor',
    );
    await screen.findByText('Next');
  },
);

it.each(['resolve', 'reject'])(
  'keeps the new initial read loading when stale pagination settles via %s',
  async (outcome) => {
    const record = { id: 'a', title: 'Plan a', items: [] };
    let resolve!: (value: { items: never[]; next_cursor: null }) => void;
    let reject!: (reason: Error) => void;
    const pending = new Promise<{ items: never[]; next_cursor: null }>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    let finishRead!: (value: typeof record) => void;
    mocks.detail.mockResolvedValueOnce(record).mockReturnValueOnce(
      new Promise<typeof record>((done) => {
        finishRead = done;
      }),
    );
    mocks.history
      .mockResolvedValueOnce({ items: [], next_cursor: 'old-cursor' })
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce({ items: [], next_cursor: 'new-cursor' });
    const { rerender } = render(<PatientClinicalPlanHistory patientId="patient" planId="a" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cargar más revisiones' }));
    rerender(<PatientClinicalPlanHistory patientId="patient" planId="b" />);
    await act(async () => {
      if (outcome === 'resolve') resolve({ items: [], next_cursor: null });
      else reject(new Error('Old page failed'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando historial');
    await act(async () => finishRead({ ...record, id: 'b', title: 'Plan b' }));
    expect(screen.getByText('Plan b')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cargar más revisiones' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  },
);

it('clears loading when the plan selection is removed during pagination', async () => {
  mocks.detail.mockResolvedValue({ id: 'a', title: 'Plan a', items: [] });
  mocks.history
    .mockResolvedValueOnce({ items: [], next_cursor: 'next' })
    .mockReturnValueOnce(new Promise(() => {}));
  const { rerender } = render(<PatientClinicalPlanHistory patientId="patient" planId="a" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cargar más revisiones' }));
  rerender(<PatientClinicalPlanHistory patientId="patient" />);
  expect(screen.getByText('Selecciona Diagnóstico para continuar la atención.')).toBeVisible();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

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

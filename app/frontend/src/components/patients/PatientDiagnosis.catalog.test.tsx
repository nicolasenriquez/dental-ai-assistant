import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { TransitionGuardProvider } from '../../hooks/useTransitionGuard';
import type { PatientTreatment, TreatmentVariant } from '../../lib/api';
import { PatientDiagnosis } from './PatientDiagnosis';

const mocks = vi.hoisted(() => ({
  conditions: vi.fn(),
  catalog: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
  correct: vi.fn(),
  history: vi.fn(),
  read: vi.fn(),
}));
vi.mock('../../lib/api', async () => ({
  ...(await vi.importActual('../../lib/api')),
  getConditionCatalog: mocks.conditions,
  getPatientConditions: vi.fn().mockResolvedValue({ items: [], total: 0, next_cursor: null }),
  getTreatmentCatalog: mocks.catalog,
  getPatientTreatments: mocks.list,
  createPatientTreatment: mocks.create,
  updatePatientTreatment: mocks.edit,
  correctPatientTreatment: mocks.correct,
  getPatientTreatmentRevisions: mocks.history,
  getPatientTreatment: mocks.read,
}));

// Same inventory the backend pins: 12 findings, 63 variants, 8 categories.
const CATEGORIES = [
  { key: 'diagnosis', label_es: 'Diagnóstico' },
  { key: 'restorative', label_es: 'Restauradora' },
  { key: 'surgery', label_es: 'Cirugía' },
  { key: 'endodontics', label_es: 'Endodoncia' },
  { key: 'orthodontics', label_es: 'Ortodoncia' },
  { key: 'preventive', label_es: 'Preventivo' },
  { key: 'periodontics', label_es: 'Periodoncia' },
  { key: 'pediatric', label_es: 'Odontopediatría' },
];
function variant(
  id: string,
  label_es: string,
  category_key: string,
  clinical_type: string,
  allowed_dentitions: TreatmentVariant['allowed_dentitions'] = ['permanent', 'primary'],
): TreatmentVariant {
  return {
    id,
    label_es,
    category_key,
    clinical_type,
    scope: 'tooth',
    enabled: true,
    disabled_reason: null,
    surface_codes: [],
    allowed_dentitions,
    visual_family: 'lateral',
    icon_key: clinical_type,
    palette_role: 'restoration',
    layer_role: 'restoration',
  };
}
const RESTORATIVE = [
  variant('REST-COMP', 'Obturación composite', 'restorative', 'filling_composite'),
  variant('REST-CROWN-MC', 'Corona metal-cerámica', 'restorative', 'crown', ['permanent']),
  variant('REST-CROWN-ZIR', 'Corona zirconio', 'restorative', 'crown'),
  ...Array.from({ length: 26 }, (_, index) =>
    variant(
      `REST-GEN-${index + 4}`,
      `Operación restauradora ${index + 4}`,
      'restorative',
      'filling_composite',
    ),
  ),
];
const OTHERS = [
  ['surgery', 'Cirugía', 5],
  ['endodontics', 'Endodoncia', 6],
  ['orthodontics', 'Ortodoncia', 5],
  ['preventive', 'Preventivo', 5],
  ['periodontics', 'Periodoncia', 5],
  ['pediatric', 'Odontopediatría', 8],
].flatMap(([key, label, count]) =>
  Array.from({ length: count as number }, (_, index) =>
    variant(`${key}-${index + 1}`, `${label} ${index + 1}`, String(key), 'filling_composite'),
  ),
);
const VARIANTS = [...RESTORATIVE, ...OTHERS];
const FINDINGS = Array.from({ length: 12 }, (_, index) => ({
  code: `finding-${index + 1}`,
  label_es: `Hallazgo ${index + 1}`,
  category_key: 'diagnosis',
  surface_codes: [],
  allowed_dentitions: ['permanent', 'primary'] as TreatmentVariant['allowed_dentitions'],
}));
const savedCrown: PatientTreatment = {
  id: '00000000-0000-4000-8000-000000000016',
  patient_id: 'p',
  variant_id: 'REST-CROWN-ZIR',
  label_es: 'Corona zirconio',
  catalog_version: 'dental-clinical-v1',
  clinical_type: 'crown',
  category_key: 'restorative',
  scope: 'tooth',
  arch: null,
  dentition: 'permanent',
  teeth: [{ tooth_fdi: 16, role: 'tooth', surfaces: [] }],
  note: null,
  state: 'existing',
  provenance: 'observed_existing',
  revision: 1,
  supersedes_id: null,
  replacement_id: null,
  created_by: { user_id: 'u', display_name: null },
  updated_by: { user_id: 'u', display_name: null },
  created_at: '2026-10-06T12:00:00Z',
  updated_at: '2026-10-06T12:00:00Z',
};
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.conditions.mockResolvedValue({ version: 1, categories: CATEGORIES, conditions: FINDINGS });
  mocks.catalog.mockResolvedValue({
    version: 'dental-clinical-v1',
    categories: CATEGORIES,
    variants: VARIANTS,
    findings: [],
  });
  mocks.list.mockResolvedValue({ items: [], total: 0, next_cursor: null });
  mocks.history.mockResolvedValue({ items: [], total: 0, next_cursor: null });
});
function mount(): void {
  render(
    <MemoryRouter>
      <TransitionGuardProvider>
        <PatientDiagnosis patientId="p" />
      </TransitionGuardProvider>
    </MemoryRouter>,
  );
}
function categories(): ReturnType<typeof within> {
  return within(screen.getByRole('group', { name: 'Categorías' }));
}
function operations(): ReturnType<typeof within> {
  return within(screen.getByRole('group', { name: 'Condiciones disponibles' }));
}
const shownLabels = (scope: ReturnType<typeof within>): (string | null)[] =>
  scope
    .getAllByRole('button')
    .map((button: HTMLElement) => button.getAttribute('aria-label') ?? button.textContent);

it('renders the complete compact catalog in stable order with full labels', async () => {
  mount();
  await screen.findByRole('button', { name: 'Restauradora' });
  expect(
    categories()
      .getAllByRole('button')
      .map((button: HTMLElement) => button.textContent),
  ).toEqual(CATEGORIES.map((category) => category.label_es));
  expect(shownLabels(operations())).toEqual(FINDINGS.map((finding) => finding.label_es));
  fireEvent.click(categories().getByRole('button', { name: 'Restauradora' }));
  expect(shownLabels(operations())).toEqual(
    VARIANTS.filter((entry) => entry.category_key === 'restorative').map((entry) => entry.label_es),
  );
  expect(operations().getByRole('status')).toHaveTextContent('29 resultados');
});

it('searches a high-volume category with normalized case and diacritics and a result count', async () => {
  mount();
  await screen.findByRole('button', { name: 'Restauradora' });
  fireEvent.click(categories().getByRole('button', { name: 'Restauradora' }));
  const search = operations().getByRole('searchbox', { name: 'Buscar en Restauradora' });
  fireEvent.change(search, { target: { value: 'zirconio' } });
  expect(operations().getByRole('button', { name: 'Corona zirconio' })).toBeVisible();
  expect(operations().queryByRole('button', { name: 'Corona metal-cerámica' })).toBeNull();
  expect(operations().getByRole('status')).toHaveTextContent('1 resultado');
  fireEvent.change(search, { target: { value: 'OBTURACION' } });
  expect(operations().getByRole('button', { name: 'Obturación composite' })).toBeVisible();
  expect(operations().queryByRole('button', { name: 'Corona zirconio' })).toBeNull();
});

it('reports no matches, clears the query and preserves the armed tool without writing', async () => {
  mount();
  await screen.findByRole('button', { name: 'Restauradora' });
  fireEvent.click(categories().getByRole('button', { name: 'Restauradora' }));
  const search = operations().getByRole('searchbox', { name: 'Buscar en Restauradora' });
  fireEvent.click(operations().getByRole('button', { name: 'Corona zirconio' }));
  expect(operations().getByRole('button', { name: 'Corona zirconio' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.change(search, { target: { value: 'zzzz' } });
  expect(operations().getByText(/sin coincidencias/i)).toBeVisible();
  fireEvent.click(operations().getByRole('button', { name: 'Limpiar búsqueda' }));
  expect(search).toHaveValue('');
  expect(operations().getByRole('status')).toHaveTextContent('29 resultados');
  expect(operations().getByRole('button', { name: 'Corona zirconio' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.edit).not.toHaveBeenCalled();
  expect(mocks.correct).not.toHaveBeenCalled();
});

it('keeps current applicability in filtered operations', async () => {
  mount();
  await screen.findByRole('button', { name: 'Restauradora' });
  fireEvent.click(screen.getByRole('button', { name: 'Temporal' }));
  fireEvent.click(categories().getByRole('button', { name: 'Restauradora' }));
  fireEvent.change(operations().getByRole('searchbox', { name: 'Buscar en Restauradora' }), {
    target: { value: 'corona' },
  });
  expect(operations().getByRole('button', { name: 'Corona metal-cerámica' })).toBeDisabled();
  expect(operations().getByRole('button', { name: 'Corona zirconio' })).toBeEnabled();
});

it('separates category navigation from the active tool action without writing', async () => {
  mount();
  await screen.findByRole('button', { name: 'Restauradora' });
  const restorative = categories().getByRole('button', { name: 'Restauradora' });
  expect(restorative).not.toHaveAttribute('aria-pressed');
  fireEvent.click(restorative);
  expect(restorative).toHaveAttribute('aria-current', 'true');
  expect(categories().getByRole('button', { name: 'Diagnóstico' })).not.toHaveAttribute(
    'aria-current',
  );
  const tool = operations().getByRole('button', { name: 'Corona zirconio' });
  fireEvent.click(tool);
  expect(tool).toHaveAttribute('aria-pressed', 'true');
  expect(restorative).toHaveAttribute('aria-current', 'true');
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.edit).not.toHaveBeenCalled();
});

it('describes crowns generically in the legend and keeps the saved variant label', async () => {
  mocks.list.mockResolvedValue({ items: [savedCrown], total: 1, next_cursor: null });
  mount();
  await screen.findAllByText(/Corona zirconio/);
  fireEvent.click(screen.getByText('Leyenda de conceptos'));
  const legend = within(screen.getByRole('region', { name: 'Leyenda Restauradora' }));
  expect(legend.getByText('Corona', { exact: true })).toBeVisible();
  expect(legend.queryByText('Corona metal-cerámica')).toBeNull();
  expect(legend.queryByText('Corona zirconio')).toBeNull();
  expect(screen.getAllByText(/Corona zirconio/).length).toBeGreaterThan(0);
});

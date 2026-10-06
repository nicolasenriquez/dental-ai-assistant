import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PatientCondition } from '../../lib/api';
import { normalizeConditionCatalog } from '../../lib/odontogramPresentation';
import { PatientOdontogram } from './PatientOdontogram';

class NarrowResizeObserver {
  constructor(private callback: (entries: { contentRect: { width: number } }[]) => void) {}
  observe(): void {
    this.callback([{ contentRect: { width: 345 } }]);
  }
  disconnect(): void {}
}
afterEach(() => vi.unstubAllGlobals());

const record: PatientCondition = {
  id: 'c',
  patient_id: 'p',
  dentition: 'permanent',
  tooth_fdi: 36,
  condition_code: 'caries',
  surfaces: ['M', 'O'],
  status: 'active',
  note: null,
  revision: 1,
  created_by: { user_id: 'u', display_name: null },
  updated_by: { user_id: 'u', display_name: null },
  created_at: '2026-10-03T12:00:00Z',
  updated_at: '2026-10-03T12:00:00Z',
};
it('orders both FDI dentitions and draws distinct anatomical families without a generic tooth stamp', () => {
  const props = {
    conditions: [],
    labels: {},
    selectedTooth: 0,
    highlightedTooth: 0,
    onSelect: vi.fn(),
    onHighlight: vi.fn(),
  };
  const { container, rerender } = render(<PatientOdontogram {...props} dentition="permanent" />);
  const order = Array.from(container.querySelectorAll('[data-arch-tooth]')).map((node) =>
    Number(node.getAttribute('data-arch-tooth')),
  );
  expect(order).toEqual([
    18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28, 48, 47, 46, 45, 44, 43, 42, 41,
    31, 32, 33, 34, 35, 36, 37, 38,
  ]);
  const outlines = ['incisor', 'canine', 'premolar', 'molar'].map((family) =>
    container.querySelector(`[data-family="${family}"] [data-profile]`)?.getAttribute('d'),
  );
  expect(new Set(outlines).size).toBe(4);
  expect(outlines.every(Boolean)).toBe(true);
  rerender(<PatientOdontogram {...props} dentition="primary" />);
  expect(
    Array.from(container.querySelectorAll('[data-arch-tooth]')).map((node) =>
      Number(node.getAttribute('data-arch-tooth')),
    ),
  ).toEqual([55, 54, 53, 52, 51, 61, 62, 63, 64, 65, 85, 84, 83, 82, 81, 71, 72, 73, 74, 75]);
  expect(container.querySelector('[data-family="premolar"]')).toBeNull();
});
it('keeps multiple active/resolved marks and mesial orientation, with text equivalents; hover never selects', () => {
  const select = vi.fn();
  const highlight = vi.fn();
  const { container } = render(
    <PatientOdontogram
      dentition="permanent"
      conditions={[
        record,
        { ...record, id: 'r', condition_code: 'fracture', surfaces: ['V'], status: 'resolved' },
      ]}
      labels={{ caries: 'Caries', fracture: 'Fractura' }}
      selectedTooth={11}
      highlightedTooth={36}
      onSelect={select}
      onHighlight={highlight}
    />,
  );
  const tooth = screen.getByRole('button', {
    name: /Pieza 36: Caries.*Activa.*Fractura.*Resuelta/,
  });
  fireEvent.mouseEnter(tooth);
  expect(highlight).toHaveBeenCalledWith(36);
  expect(select).not.toHaveBeenCalled();
  fireEvent.focus(tooth);
  expect(select).not.toHaveBeenCalled();
  fireEvent.click(tooth);
  expect(select).toHaveBeenCalledWith(36);
  expect(container.querySelectorAll('[data-arch-tooth="36"] [data-condition-id]')).toHaveLength(2);
  expect(container.querySelector('[data-arch-tooth="36"] [data-surface="M"]')).toHaveAttribute(
    'data-position',
    'left',
  );
  expect(container.querySelector('[data-arch-tooth="36"] [data-condition-id="r"]')).toHaveAttribute(
    'stroke-dasharray',
    '3 2',
  );
  expect(container.querySelector('[data-draft-tooth="11"]')).not.toBeNull();
});
it('consumes the shared catalog for labels and neutral symbols', () => {
  const { container } = render(
    <PatientOdontogram
      dentition="permanent"
      conditions={[
        record,
        { ...record, id: 'syn', tooth_fdi: 37, condition_code: 'synthetic', surfaces: [] },
      ]}
      labels={{}}
      catalog={normalizeConditionCatalog({
        version: 1,
        conditions: [
          { code: 'caries', label_es: 'Caries', surface_codes: ['M', 'D', 'O', 'V', 'L'] },
          { code: 'synthetic', label_es: 'Hallazgo de prueba', surface_codes: [] },
        ],
      })}
      selectedTooth={0}
      highlightedTooth={0}
      onSelect={vi.fn()}
      onHighlight={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: /Pieza 36: Caries, Activa/ })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Pieza 37: Hallazgo de prueba, Activa/ }),
  ).toBeInTheDocument();
  expect(
    container.querySelector('[data-arch-tooth="36"] [data-condition-symbol="caries"]'),
  ).not.toBeNull();
  expect(
    container.querySelector('[data-arch-tooth="37"] [data-condition-symbol="neutral"]'),
  ).not.toBeNull();
});

it('pages anatomical quadrants with named controls and keeps the draft piece across switches', () => {
  vi.stubGlobal('ResizeObserver', NarrowResizeObserver);
  const select = vi.fn();
  render(
    <PatientOdontogram
      dentition="permanent"
      conditions={[]}
      labels={{}}
      selectedTooth={16}
      highlightedTooth={0}
      onSelect={select}
      onHighlight={vi.fn()}
    />,
  );
  const quadrants = screen.getByRole('group', { name: 'Cuadrantes permanentes' });
  expect(
    within(quadrants)
      .getAllByRole('button')
      .map((node) => node.textContent),
  ).toEqual(['Superior derecha', 'Superior izquierda', 'Inferior derecha', 'Inferior izquierda']);
  const teethOf = (quadrant: number): string[] =>
    within(screen.getByRole('group', { name: `Piezas del cuadrante ${quadrant}` }))
      .getAllByRole('button')
      .map((node) => node.textContent);
  expect(teethOf(1)).toEqual([
    'Pieza 18',
    'Pieza 17',
    'Pieza 16',
    'Pieza 15',
    'Pieza 14',
    'Pieza 13',
    'Pieza 12',
    'Pieza 11',
  ]);
  expect(
    within(screen.getByRole('group', { name: 'Piezas del cuadrante 1' }))
      .getAllByRole('button')
      .find((node) => node.textContent === 'Pieza 16'),
  ).toHaveAttribute('aria-pressed', 'true');
  const reachable: string[] = [...teethOf(1)];
  fireEvent.click(within(quadrants).getByRole('button', { name: 'Superior izquierda' }));
  expect(select).not.toHaveBeenCalled();
  reachable.push(...teethOf(2));
  expect(reachable).toContain('Pieza 22');
  fireEvent.click(within(quadrants).getByRole('button', { name: 'Inferior derecha' }));
  reachable.push(...teethOf(4));
  fireEvent.click(within(quadrants).getByRole('button', { name: 'Inferior izquierda' }));
  reachable.push(...teethOf(3));
  expect(reachable).toHaveLength(32);
  expect(new Set(reachable).size).toBe(32);
  expect(
    screen
      .getByRole('group', { name: 'Piezas del cuadrante 3' })
      .querySelector('[data-quadrant-tooth="38"]'),
  ).not.toBeNull();
  expect(
    screen
      .getByRole('group', { name: 'Piezas del cuadrante 3' })
      .querySelector('[data-quadrant-tooth="16"]'),
  ).toBeNull();
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Piezas del cuadrante 3' }))
      .getAllByRole('button')
      .find((node) => node.textContent === 'Pieza 36') as HTMLElement,
  );
  expect(select).toHaveBeenCalledWith(36);
});

it('shows the selected quadrant first, keeps it after dentition change, and names all primary quadrants', () => {
  vi.stubGlobal('ResizeObserver', NarrowResizeObserver);
  const { rerender } = render(
    <PatientOdontogram
      dentition="permanent"
      conditions={[]}
      labels={{}}
      selectedTooth={31}
      highlightedTooth={0}
      onSelect={vi.fn()}
      onHighlight={vi.fn()}
    />,
  );
  expect(screen.getByRole('group', { name: 'Piezas del cuadrante 3' })).toBeInTheDocument();
  rerender(
    <PatientOdontogram
      dentition="primary"
      conditions={[]}
      labels={{}}
      selectedTooth={0}
      highlightedTooth={0}
      onSelect={vi.fn()}
      onHighlight={vi.fn()}
    />,
  );
  expect(screen.getByRole('group', { name: 'Cuadrantes temporales' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Piezas del cuadrante 5' })).toBeInTheDocument();
  expect(
    within(screen.getByRole('group', { name: 'Piezas del cuadrante 5' }))
      .getAllByRole('button')
      .map((node) => node.textContent),
  ).toContain('Pieza 55');
});

it('describes whole-tooth and optional-empty extents with the shared surface wording', () => {
  render(
    <PatientOdontogram
      dentition="permanent"
      conditions={[
        record,
        { ...record, id: 'w', tooth_fdi: 26, condition_code: 'missing', surfaces: [] },
        { ...record, id: 'e', tooth_fdi: 27, condition_code: 'caries', surfaces: [] },
      ]}
      labels={{}}
      catalog={normalizeConditionCatalog({
        version: 1,
        conditions: [
          { code: 'caries', label_es: 'Caries', surface_codes: ['M', 'D', 'O', 'V', 'L'] },
          { code: 'missing', label_es: 'Ausente', surface_codes: [] },
        ],
      })}
      selectedTooth={0}
      highlightedTooth={0}
      onSelect={vi.fn()}
      onHighlight={vi.fn()}
    />,
  );
  expect(
    screen.getByRole('button', {
      name: /Pieza 26: Ausente, Activa, Pieza completa, sin superficies/,
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Pieza 27: Caries, Activa, Sin superficies especificadas/ }),
  ).toBeInTheDocument();
});

it('marks entered_in_error records with a slash outside the concept geometry', () => {
  const { container } = render(
    <PatientOdontogram
      dentition="permanent"
      conditions={[
        {
          ...record,
          status: 'entered_in_error',
          correction: {
            operation_id: 'op',
            condition_id: 'c',
            correction_revision_id: 'rev',
            reason: 'Incorrecta',
            replacement_condition_id: null,
            replacement_revision_id: null,
          },
        },
      ]}
      labels={{}}
      catalog={normalizeConditionCatalog({
        version: 1,
        conditions: [
          { code: 'caries', label_es: 'Caries', surface_codes: ['M', 'D', 'O', 'V', 'L'] },
        ],
      })}
      selectedTooth={0}
      highlightedTooth={0}
      onSelect={vi.fn()}
      onHighlight={vi.fn()}
    />,
  );
  const tooth = container.querySelector('[data-arch-tooth="36"]');
  expect(
    tooth?.querySelector('[data-condition-symbol="caries"] [data-error-marker]'),
  ).not.toBeNull();
  expect(tooth?.querySelector('[data-resolved-surface]')).toBeNull();
  expect(screen.getByRole('button', { name: /Registrada por error/ })).toBeInTheDocument();
});

import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { PatientCondition } from '../../lib/api';
import { normalizeConditionCatalog } from '../../lib/odontogramPresentation';
import { PatientOdontogram } from './PatientOdontogram';

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

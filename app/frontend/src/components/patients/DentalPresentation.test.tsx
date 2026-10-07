import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PatientOdontogram } from './PatientOdontogram';

it('renders eight scaled profiles, both arches and independently linked note highlights', () => {
  const { container } = render(
    <PatientOdontogram
      dentition="permanent"
      conditions={[]}
      labels={{}}
      selectedTooth={16}
      highlightedTooth={0}
      highlightedTeeth={[16, 17, 18]}
      onSelect={vi.fn()}
      onHighlight={vi.fn()}
    />,
  );
  expect(container.querySelectorAll('[data-profile]')).toHaveLength(32);
  expect(
    new Set([...container.querySelectorAll('[data-profile]')].map((node) => node.getAttribute('d')))
      .size,
  ).toBe(8);
  expect(container.querySelector('[data-arch-tooth="11"] [data-anatomical-scale]')).toHaveAttribute(
    'data-anatomical-scale',
    '0.65',
  );
  expect(container.querySelector('[data-arch-tooth="18"] [data-anatomical-scale]')).toHaveAttribute(
    'data-anatomical-scale',
    '1.2',
  );
  expect(container.querySelectorAll('[data-linked-highlight]')).toHaveLength(3);
});

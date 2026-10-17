import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DentalHistoryTimeline } from './DentalHistoryTimeline';

const dates = ['2026-08-13', '2026-08-05', '2026-07-30'];

function renderTimeline(overrides: Partial<ComponentProps<typeof DentalHistoryTimeline>> = {}) {
  const onSelectDay = vi.fn();
  const onLoadOlder = vi.fn();
  render(
    <DentalHistoryTimeline
      dates={dates}
      selectedDay={null}
      onSelectDay={onSelectDay}
      hasMore={false}
      loadingOlder={false}
      onLoadOlder={onLoadOlder}
      loadedEvents={3}
      totalEvents={9}
      {...overrides}
    />,
  );
  return { onSelectDay, onLoadOlder };
}

describe('DentalHistoryTimeline', () => {
  it('renders the current position and named loaded dates with only the selection pressed', () => {
    renderTimeline();
    expect(screen.getByRole('button', { name: 'Actual' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '13 ago 2026' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByText(/Fechas cargadas: 30 jul 2026 – 13 ago 2026/)).toBeVisible();
    expect(screen.getByText(/Eventos cargados: 3 de 9/)).toBeVisible();
  });

  it('marks the selected date without highlighting the current position', () => {
    renderTimeline({ selectedDay: '2026-08-05' });
    expect(screen.getByRole('button', { name: 'Actual' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '05 ago 2026' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('moves the selection with the discrete range keys', () => {
    const { onSelectDay } = renderTimeline({ selectedDay: '2026-08-13' });
    const group = screen.getByRole('group', { name: 'Seleccionar fecha clínica' });
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onSelectDay).toHaveBeenLastCalledWith('2026-08-05');
    expect(screen.getByRole('button', { name: '05 ago 2026' })).toHaveFocus();
    fireEvent.keyDown(group, { key: 'Home' });
    expect(onSelectDay).toHaveBeenLastCalledWith(null);
    fireEvent.keyDown(group, { key: 'End' });
    expect(onSelectDay).toHaveBeenLastCalledWith('2026-07-30');
  });

  it('keeps a deep-linked date outside the loaded pages and offers older dates explicitly', () => {
    const { onLoadOlder } = renderTimeline({
      dates: [],
      selectedDay: '2026-08-13',
      hasMore: true,
    });
    expect(screen.getByText(/Sin fechas cargadas/)).toBeVisible();
    expect(screen.getByRole('button', { name: '13 ago 2026' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cargar fechas anteriores' }));
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when no recorded date or selection exists', () => {
    const { container } = render(
      <DentalHistoryTimeline
        dates={[]}
        selectedDay={null}
        onSelectDay={vi.fn()}
        hasMore={false}
        loadingOlder={false}
        onLoadOlder={vi.fn()}
        loadedEvents={0}
        totalEvents={0}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

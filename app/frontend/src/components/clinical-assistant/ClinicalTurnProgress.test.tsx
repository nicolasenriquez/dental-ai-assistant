import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalTranscriptItem } from '../../hooks/useClinicalAssistant';
import { ClinicalTurnProgress } from './ClinicalTurnProgress';

const user: ClinicalTranscriptItem = {
  id: 'user:turn-1',
  turnId: 'turn-1',
  type: 'user',
  status: 'completed',
  createdAt: '2026-09-25T12:00:00.000Z',
  content: 'Control',
};

function activity(
  id: string,
  label: string,
  status: 'running' | 'pending' = 'running',
): ClinicalTranscriptItem {
  return { ...user, id, type: 'activity', label, status };
}

afterEach(() => vi.useRealTimers());

describe('ClinicalTurnProgress', () => {
  it('uses the matching user timestamp for 0, 2 and 5 seconds without announcing ticks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(user.createdAt));
    const view = render(
      <ClinicalTurnProgress turn={{ turnId: 'turn-1', phase: 'running' }} items={[user]} />,
    );
    expect(view.container).toHaveTextContent('· 0 s');
    act(() => vi.advanceTimersByTime(2000));
    expect(view.container).toHaveTextContent('· 2 s');
    act(() => vi.advanceTimersByTime(3000));
    expect(view.container).toHaveTextContent('· 5 s');
    expect(screen.getByRole('status')).not.toHaveTextContent('5 s');
  });

  it('starts at zero without a hydrated user, then uses that turn timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T12:00:05.000Z'));
    const turn = { turnId: 'turn-1', phase: 'running' as const };
    const view = render(<ClinicalTurnProgress turn={turn} items={[]} />);
    expect(view.container).toHaveTextContent('· 0 s');
    view.rerender(<ClinicalTurnProgress turn={turn} items={[user]} />);
    expect(view.container).toHaveTextContent('· 5 s');
  });

  it('keeps each visible label for 300 ms and coalesces rapid changes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(user.createdAt));
    const turn = { turnId: 'turn-1', phase: 'running' as const };
    const first = activity('a', 'Revisando contexto');
    const view = render(<ClinicalTurnProgress turn={turn} items={[user, first]} />);
    expect(view.container).toHaveTextContent('Preparando respuesta clínica');
    act(() => vi.advanceTimersByTime(300));
    expect(view.container).toHaveTextContent('Revisando contexto');
    const second = activity('b', 'Leyendo ficha');
    view.rerender(<ClinicalTurnProgress turn={turn} items={[user, first, second]} />);
    act(() => vi.advanceTimersByTime(100));
    const third = activity('c', 'Preparando evolución');
    view.rerender(<ClinicalTurnProgress turn={turn} items={[user, first, second, third]} />);
    expect(view.container).toHaveTextContent('Revisando contexto');
    act(() => vi.advanceTimersByTime(200));
    expect(view.container).toHaveTextContent('Preparando evolución');
    expect(view.container).not.toHaveTextContent('Leyendo ficha');
  });

  it('prefers the latest running activity and makes Stop and output compact immediately', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(user.createdAt));
    const pending = activity('pending', 'En cola', 'pending');
    const running = activity('running', 'Revisando ficha');
    const view = render(
      <ClinicalTurnProgress
        turn={{ turnId: 'turn-1', phase: 'running' }}
        items={[user, running, pending]}
      />,
    );
    act(() => vi.advanceTimersByTime(300));
    expect(view.container).toHaveTextContent('Revisando ficha');
    view.rerender(
      <ClinicalTurnProgress
        turn={{ turnId: 'turn-1', phase: 'stopping' }}
        items={[user, running, pending]}
      />,
    );
    expect(view.container.querySelector('.clinical-turn-progress__heading')).toHaveTextContent(
      'Deteniendo respuesta…',
    );
    expect(view.container.querySelector('.clinical-turn-progress__label')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Deteniendo respuesta…');
    view.rerender(
      <ClinicalTurnProgress
        turn={{ turnId: 'turn-1', phase: 'running' }}
        items={[user, running, { ...user, id: 'assistant', type: 'assistant', content: 'Listo' }]}
      />,
    );
    expect(view.container.querySelector('.is-compact')).toBeInTheDocument();
    expect(view.container.querySelector('.clinical-turn-progress__label')).not.toBeInTheDocument();
  });
});

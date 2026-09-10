import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ClinicalTranscriptItem } from '../../hooks/useClinicalAssistant';
import { ClinicalTranscript } from './ClinicalTranscript';

const base = { turnId: 'turn-1', createdAt: '2026-09-10T12:00:00Z' };
const callbacks = {
  onDraftChange: vi.fn(),
  onDraftSourceChange: vi.fn(),
  onDraftDateChange: vi.fn(),
  onDraftRegenerate: vi.fn(),
  onPrepare: vi.fn(),
  onResolve: vi.fn(),
  onRetry: vi.fn(),
};

beforeAll(() => {
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(cleanup);

function renderTranscript(items: ClinicalTranscriptItem[], busy = true) {
  return render(
    <MemoryRouter>
      <ClinicalTranscript threadId="thread-1" items={items} busy={busy} {...callbacks} />
    </MemoryRouter>,
  );
}

describe('ClinicalTranscript', () => {
  it('shows thinking only while a busy user item is latest', () => {
    const user: ClinicalTranscriptItem = {
      ...base,
      id: 'user-1',
      type: 'user',
      status: 'completed',
      content: 'Control preventivo',
    };
    const view = renderTranscript([user]);
    expect(
      screen.getByRole('status', { name: 'El asistente está preparando una respuesta' }),
    ).toHaveTextContent('Pensando…');

    view.rerender(
      <MemoryRouter>
        <ClinicalTranscript
          threadId="thread-1"
          items={[
            user,
            {
              ...base,
              id: 'activity-1',
              type: 'activity',
              status: 'running',
              label: 'Analizando exactamente',
            },
          ]}
          busy
          {...callbacks}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Pensando…')).not.toBeInTheDocument();
    expect(screen.getByText('Analizando exactamente')).toBeVisible();
  });

  it('does not show thinking when idle', () => {
    renderTranscript(
      [{ ...base, id: 'user-1', type: 'user', status: 'completed', content: 'Control' }],
      false,
    );
    expect(screen.queryByText('Pensando…')).not.toBeInTheDocument();
  });

  it.each([
    ['pending', 'clinical-activity--active'],
    ['running', 'clinical-activity--active'],
    ['completed', 'clinical-activity--completed'],
    ['failed', 'clinical-activity--failed'],
    ['declined', 'clinical-activity--declined'],
  ] as const)('maps %s activity status without changing its label', (status, className) => {
    renderTranscript([
      { ...base, id: `activity-${status}`, type: 'activity', status, label: 'pensando literal' },
    ]);
    expect(screen.getByRole('status')).toHaveClass(className);
    expect(screen.getByText('pensando literal')).toBeVisible();
  });
});

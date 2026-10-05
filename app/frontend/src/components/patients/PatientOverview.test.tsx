import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { PatientOverview } from './PatientOverview';

afterEach(() => vi.restoreAllMocks());

describe('PatientOverview clinical hierarchy', () => {
  it('keeps API totals beside exact clinical actions and separates failed Drive copies', async () => {
    vi.spyOn(api, 'getClinicalPendingWork').mockImplementation(
      async (_patient, _cursor, options) => {
        const kind = options?.kind ?? 'approval_required';
        return {
          total: kind === 'approval_required' ? 5 : kind === 'recoverable_draft' ? 1 : 12345,
          next_cursor: null,
          items: [
            {
              id: kind,
              kind,
              patient: {
                id: 'patient',
                display_name: 'Ana Pérez',
                rut_masked: '••.•••.941-5',
              },
              updated_at: '2026-10-05T12:00:00Z',
              action:
                kind === 'drive_export_failed'
                  ? { kind: 'retry_drive_export', evolution_id: 'saved-evolution', thread_id: null }
                  : kind === 'approval_required'
                    ? { kind: 'review_approval', action_id: 'approval', thread_id: 'review-thread' }
                    : { kind: 'continue_draft', artifact_id: 'draft', thread_id: 'draft-thread' },
            },
          ],
        } as api.PendingWorkPage;
      },
    );
    render(
      <MemoryRouter>
        <PatientOverview patientId="patient" evolutions={[]} onAssistant={vi.fn()} />
      </MemoryRouter>,
    );
    const pending = await screen.findByRole('region', { name: 'Trabajo clínico pendiente' });
    await waitFor(() => expect(within(pending).getByText('5')).toBeVisible());
    expect(within(pending).getByRole('link', { name: 'Revisar' })).toHaveAttribute(
      'href',
      '/a/review-thread',
    );
    expect(within(pending).getByRole('link', { name: 'Continuar trabajo' })).toHaveAttribute(
      'href',
      '/a/draft-thread',
    );
    const sync = screen.getByRole('region', { name: 'Sincronización con Drive' });
    expect(within(sync).getByText('12.345')).toBeVisible();
    expect(within(sync).getByRole('link', { name: 'Recuperar sincronización' })).toHaveAttribute(
      'href',
      '/patients/patient/evolutions/saved-evolution',
    );
    expect(within(sync).queryByRole('link', { name: 'Revisar' })).toBeNull();
  });

  it('shows unavailable and retries without inventing a zero or offering stale actions', async () => {
    const get = vi.spyOn(api, 'getClinicalPendingWork').mockRejectedValue(new Error('offline'));
    render(
      <MemoryRouter>
        <PatientOverview patientId="patient" evolutions={[]} onAssistant={vi.fn()} />
      </MemoryRouter>,
    );
    await screen.findAllByRole('alert');
    const pending = screen.getByRole('region', { name: 'Trabajo clínico pendiente' });
    expect(within(pending).queryByText('0')).toBeNull();
    get.mockResolvedValue({ items: [], total: 0, next_cursor: null });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar por revisar' }));
    await waitFor(() => expect(within(pending).getByText('0')).toBeVisible());
    expect(within(pending).queryByRole('link')).toBeNull();
  });
});

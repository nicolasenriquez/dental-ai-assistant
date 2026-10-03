import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { PatientOverview } from '../patients/PatientOverview';
import { ClinicalPendingWork } from './ClinicalPendingWork';
import { ClinicalReadResult } from './ClinicalReadResult';

afterEach(() => vi.restoreAllMocks());

it('distinguishes pending query failure from empty and supports explicit recovery', async () => {
  const query = vi
    .spyOn(api, 'getClinicalPendingWork')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ items: [], total: 0, next_cursor: null });
  render(
    <MemoryRouter>
      <ClinicalPendingWork />
    </MemoryRouter>,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar tus pendientes');
  expect(screen.queryByText('No hay trabajo pendiente')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('No hay trabajo pendiente')).toBeVisible();
  expect(query).toHaveBeenCalledTimes(2);
});

it.each(['t', null])(
  'retries failed Drive copy with thread %s without saving again',
  async (threadId) => {
    vi.spyOn(api, 'getClinicalPendingWork')
      .mockResolvedValueOnce({
        items: [
          {
            id: 'drive:e',
            kind: 'drive_export_failed',
            patient: { id: 'p', display_name: 'Camila Soto', rut_masked: '•••' },
            updated_at: '2026-10-01T12:00:00Z',
            action: { kind: 'retry_drive_export', evolution_id: 'e', thread_id: threadId },
          },
        ],
        total: 1,
        next_cursor: null,
      })
      .mockResolvedValue({ items: [], total: 0, next_cursor: null });
    const retry = vi
      .spyOn(api, 'retryClinicalDriveExport')
      .mockResolvedValue({ drive_export: { status: 'pending' } });
    const save = vi.spyOn(api, 'resolveClinicalAction');
    render(
      <MemoryRouter>
        <ClinicalPendingWork />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(retry).toHaveBeenCalledWith('e'));
    expect(save).not.toHaveBeenCalled();
    expect(await screen.findByText('No hay trabajo pendiente')).toBeVisible();
  },
);

it('opens the saved evolution for a failed manual export', async () => {
  vi.spyOn(api, 'getClinicalPendingWork').mockResolvedValue({
    items: [
      {
        id: 'drive:e',
        kind: 'drive_export_failed',
        patient: { id: 'p', display_name: 'Camila Soto', rut_masked: '•••' },
        updated_at: '2026-10-01T12:00:00Z',
        action: { kind: 'retry_drive_export', evolution_id: 'e', thread_id: null },
      },
    ],
    total: 1,
    next_cursor: null,
  });
  render(
    <MemoryRouter>
      <PatientOverview patientId="p" evolutions={[]} onAssistant={vi.fn()} />
    </MemoryRouter>,
  );
  expect(await screen.findByRole('link', { name: 'Recuperar sincronización' })).toHaveAttribute(
    'href',
    '/patients/p/evolutions/e',
  );
});

it('dispatches by stable result kind and hides unknown payload behind fallback', () => {
  render(
    <MemoryRouter>
      <ClinicalReadResult
        result={{
          result_kind: 'evolution_list',
          payload: {
            patient_id: 'p',
            evolutions: [{ id: 'e', evolution_at: '2026-10-01T12:00:00Z' }],
          },
        }}
        fallback="Resultado"
      />
      <ClinicalReadResult
        result={{ result_kind: 'unknown', payload: { secret: 'internal identifier' } }}
        fallback="Consulta completada"
      />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: /Ver evolución del/ })).toHaveAttribute(
    'href',
    '/patients/p/evolutions/e',
  );
  expect(screen.getByText('Consulta completada')).toBeVisible();
  expect(screen.queryByText('internal identifier')).not.toBeInTheDocument();
});

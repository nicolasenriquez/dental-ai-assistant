import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { DriveJournalPanel } from './DriveJournalPanel';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    getDriveJournalPreferences: vi.fn(),
    updateDriveJournalPreferences: vi.fn(),
    getDriveJournalDetail: vi.fn(),
  };
});

const journals: api.DriveJournalSummary[] = [
  {
    period_type: 'weekly',
    period_key: '2026-W37',
    journal_part: 1,
    display_name: 'Evoluciones — 2026-W37.txt',
    updated_at: '2026-09-12T12:00:00Z',
  },
  {
    period_type: 'weekly',
    period_key: '2026-W37',
    journal_part: 2,
    display_name: 'Evoluciones — 2026-W37 — 2.txt',
    updated_at: '2026-09-13T12:00:00Z',
  },
  {
    period_type: 'daily',
    period_key: '2026-09-14',
    journal_part: 1,
    display_name: 'Evoluciones — 2026-09-14.txt',
    updated_at: '2026-09-14T12:00:00Z',
  },
];

const detail = (
  part: number,
  entries = [
    {
      evolution_id: 'evolution-1',
      occurred_at: '2026-09-13T10:00:00Z',
      patient_display_name: 'Ana Pérez',
      patient_rut_masked: '12.345.•••-6',
      content: 'Control periodontal estable',
    },
  ],
) => ({
  period_type: 'weekly' as const,
  period_key: '2026-W37',
  journal_part: part,
  display_name: `Evoluciones — 2026-W37${part === 1 ? '' : ` — ${part}`}.txt`,
  updated_at: '2026-09-13T12:00:00Z',
  entries,
});

const getPreferencesMock = api.getDriveJournalPreferences as unknown as ReturnType<typeof vi.fn>;
const updatePreferencesMock = api.updateDriveJournalPreferences as unknown as ReturnType<
  typeof vi.fn
>;
const getDetailMock = api.getDriveJournalDetail as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  getPreferencesMock.mockResolvedValue({ frequency: 'weekly' });
  updatePreferencesMock.mockResolvedValue({ frequency: 'daily' });
  getDetailMock.mockImplementation(async (_type: string, _key: string, part: number) => ({
    journal: detail(part),
  }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe('DriveJournalPanel', () => {
  it('suppresses Parte 1 for one-part periods and reveals rollover parts as one group', async () => {
    render(<DriveJournalPanel journals={journals} loading={false} />);

    await screen.findByLabelText('Agrupar nuevas evoluciones');
    expect(screen.getByText('14 de septiembre de 2026')).toBeInTheDocument();
    expect(screen.queryByText('Parte 1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Semana 37 de 2026/ }));
    expect(screen.getByText('2 partes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Parte 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Parte 2/ })).toBeInTheDocument();
  });

  it('loads exact part 2 and searches current detail without another fetch', async () => {
    render(<DriveJournalPanel journals={journals} loading={false} />);

    fireEvent.click(screen.getByRole('button', { name: /Semana 37 de 2026/ }));
    fireEvent.click(screen.getByRole('button', { name: /Parte 2/ }));
    expect(await screen.findByText('Control periodontal estable')).toBeInTheDocument();
    expect(getDetailMock).toHaveBeenCalledWith('weekly', '2026-W37', 2);

    const fetchCalls = getDetailMock.mock.calls.length;
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar en este diario' }), {
      target: { value: 'no existe' },
    });
    expect(getDetailMock).toHaveBeenCalledTimes(fetchCalls);
    expect(screen.getByText('No encontramos evoluciones para esta búsqueda.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(await screen.findByText('Control periodontal estable')).toBeInTheDocument();
    expect(getDetailMock).toHaveBeenCalledTimes(fetchCalls);
  });

  it('opens exact deep-link target, focuses and temporarily highlights matching entry', async () => {
    const consumed = vi.fn();
    render(
      <StrictMode>
        <DriveJournalPanel
          journals={journals}
          loading={false}
          initialTarget={{
            evolutionId: 'evolution-1',
            journal: { period_type: 'weekly', period_key: '2026-W37', journal_part: 2 },
          }}
          onInitialTargetConsumed={consumed}
        />
      </StrictMode>,
    );

    const entry = await screen.findByRole('article', { name: 'Ana Pérez' });
    await waitFor(() => expect(entry).toHaveFocus());
    expect(entry).toHaveClass('drive-journal-entry--highlighted');
    expect(getDetailMock).toHaveBeenCalledWith('weekly', '2026-W37', 2);
    expect(consumed).toHaveBeenCalledOnce();
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'center' }),
    );
    expect(getDetailMock).toHaveBeenCalledTimes(1);
  });

  it('keeps reader open and reports contextual error when deep-link entry is absent', async () => {
    getDetailMock.mockResolvedValueOnce({ journal: detail(2, []) });
    render(
      <DriveJournalPanel
        journals={journals}
        loading={false}
        initialTarget={{
          evolutionId: 'missing-evolution',
          journal: { period_type: 'weekly', period_key: '2026-W37', journal_part: 2 },
        }}
      />,
    );

    expect(
      await screen.findByText('No encontramos la evolución solicitada en este diario remoto.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Evoluciones/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a Diarios' })).toBeInTheDocument();
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('keeps canonical frequency after successful save with inline progress', async () => {
    let resolve!: (value: api.DriveJournalPreferences) => void;
    updatePreferencesMock.mockReturnValueOnce(
      new Promise<api.DriveJournalPreferences>((done) => {
        resolve = done;
      }),
    );
    render(<DriveJournalPanel journals={journals} loading={false} />);

    const select = await screen.findByLabelText('Agrupar nuevas evoluciones');
    fireEvent.change(select, { target: { value: 'daily' } });
    expect(select).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Guardando…');
    act(() => resolve({ frequency: 'daily' }));

    await waitFor(() => expect(select).toHaveValue('daily'));
    expect(select).not.toBeDisabled();
    expect(screen.queryByText('Reintentar')).not.toBeInTheDocument();
  });

  it('rolls back failed frequency save and retries the same value', async () => {
    updatePreferencesMock.mockRejectedValueOnce(new Error('offline'));
    render(<DriveJournalPanel journals={journals} loading={false} />);

    const select = await screen.findByLabelText('Agrupar nuevas evoluciones');
    fireEvent.change(select, { target: { value: 'daily' } });
    await waitFor(() => expect(select).toHaveValue('weekly'));
    expect(screen.getByText('No se pudo guardar la preferencia. Puedes reintentar.')).toBeVisible();

    updatePreferencesMock.mockResolvedValueOnce({ frequency: 'daily' });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(select).toHaveValue('daily'));
    expect(updatePreferencesMock).toHaveBeenLastCalledWith('daily');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

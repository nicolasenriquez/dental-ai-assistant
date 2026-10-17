import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { PatientDentalHistory } from './PatientDentalHistory';

const patientId = 'patient-1';
const epoch = 'history-epoch-1';
const day = '2026-08-13';
const conditionId = '00000000-0000-4000-8000-0000000000c1';

const conditionSnapshot: api.ConditionSnapshot = {
  dentition: 'permanent',
  tooth_fdi: 36,
  condition_code: 'caries',
  surfaces: ['M'],
  note: 'Nota de la revisión',
  status: 'active',
};
const conditionItem: api.DentalHistorySnapshotItem = {
  resource_kind: 'condition',
  resource_id: conditionId,
  revision: 2,
  changed_at: '2026-08-13T15:00:00Z',
  snapshot: conditionSnapshot,
  chart_eligible: true,
};
const editedEvent: api.DentalHistoryEvent = {
  event_id: '00000000-0000-4000-8000-0000000000e1',
  resource_kind: 'condition',
  resource_id: conditionId,
  revision: 2,
  action: 'edited',
  changed_at: '2026-08-13T15:00:00Z',
  clinical_date: day,
  actor: { user_id: '11111111-1111-4111-8111-111111111111', display_name: 'Dra. Alfa' },
  before: { ...conditionSnapshot, surfaces: [], note: null },
  after: conditionSnapshot,
};
const createdOlderEvent: api.DentalHistoryEvent = {
  ...editedEvent,
  event_id: '00000000-0000-4000-8000-0000000000e2',
  revision: 1,
  action: 'created',
  changed_at: '2026-08-05T12:00:00Z',
  clinical_date: '2026-08-05',
};

function counts(records: number): api.DentalHistoryCounts {
  return {
    records,
    findings: records,
    procedures: 0,
    charted_records: records,
    affected_teeth: records,
    affected_arches: 0,
    deleted_records: 0,
  };
}

function snapshotPage(
  items: api.DentalHistorySnapshotItem[] = [conditionItem],
  at: string | null = null,
  coverage: api.DentalHistoryCoverage = {
    state: 'complete',
    earliest_recorded_at: null,
    warnings: [],
  },
): api.DentalHistorySnapshotPage {
  return {
    selection: { at, timezone: 'America/Santiago', cutoff_exclusive: null },
    items,
    next_cursor: null,
    epoch,
    read_at: '2026-10-17T12:00:00Z',
    counts: counts(items.length),
    coverage,
  };
}

function eventsPage(
  items: api.DentalHistoryEvent[] = [editedEvent],
  next: string | null = null,
  total = items.length,
): api.DentalHistoryEventsPage {
  return {
    selection: {
      day: null,
      timezone: 'America/Santiago',
      start_inclusive: null,
      cutoff_exclusive: null,
    },
    items,
    next_cursor: next,
    total_events: total,
    epoch,
    timezone: 'America/Santiago',
    read_at: '2026-10-17T12:00:00Z',
  };
}

function mockCatalog() {
  vi.spyOn(api, 'getConditionCatalog').mockResolvedValue({
    version: 1,
    conditions: [{ code: 'caries', label_es: 'Caries', surface_codes: ['M', 'D', 'O', 'V', 'L'] }],
  });
  vi.spyOn(api, 'getTreatmentCatalog').mockResolvedValue({
    version: '1',
    categories: [],
    variants: [],
    findings: [],
  });
}

function spyWrites() {
  return [
    vi.spyOn(api, 'createPatientCondition'),
    vi.spyOn(api, 'updatePatientCondition'),
    vi.spyOn(api, 'deletePatientCondition'),
    vi.spyOn(api, 'createPatientTreatment'),
    vi.spyOn(api, 'updatePatientTreatment'),
    vi.spyOn(api, 'deletePatientTreatment'),
    vi.spyOn(api, 'createPatientNote'),
    vi.spyOn(api, 'updatePatientNote'),
    vi.spyOn(api, 'createDentalClinicalNote'),
    vi.spyOn(api, 'deleteDentalClinicalNote'),
  ];
}

function renderHistory(overrides: Partial<ComponentProps<typeof PatientDentalHistory>> = {}) {
  const onSelectDay = vi.fn();
  const onSelectDentition = vi.fn();
  const onLeave = vi.fn();
  const view = render(
    <PatientDentalHistory
      patientId={patientId}
      at={null}
      dentition="permanent"
      onSelectDay={onSelectDay}
      onSelectDentition={onSelectDentition}
      onLeave={onLeave}
      {...overrides}
    />,
  );
  return { onSelectDay, onSelectDentition, onLeave, view };
}

const writeControls = [/Registrar/, /Editar/, /Guardar/, /Corregir/, /Deshacer/, /Eliminar/];

describe('PatientDentalHistory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the complete current chart with distinct counts and no write controls', async () => {
    mockCatalog();
    vi.spyOn(api, 'getPatientDentalHistory').mockResolvedValue(eventsPage());
    const snapshot = vi
      .spyOn(api, 'getPatientDentalHistorySnapshot')
      .mockImplementation((_id, options) =>
        Promise.resolve(snapshotPage([conditionItem], options.at ?? null)),
      );
    const writes = spyWrites();
    renderHistory();
    expect(await screen.findByText('Estado actual')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Odontograma' })).toBeVisible();
    const panel = screen.getByRole('region', { name: 'Historial dental' });
    for (const label of [
      'Registros',
      'Hallazgos',
      'Procedimientos',
      'En el odontograma',
      'Piezas afectadas',
      'Arcadas afectadas',
      'Registros eliminados',
    ]) {
      expect(within(panel).getByText(label)).toBeVisible();
    }
    expect(within(panel).getByText('Según el historial disponible. Solo lectura.')).toBeVisible();
    expect(snapshot).toHaveBeenCalledWith(
      patientId,
      expect.objectContaining({ dentition: 'permanent', limit: 100 }),
    );
    for (const pattern of writeControls) {
      expect(within(panel).queryAllByRole('button', { name: pattern })).toHaveLength(0);
    }
    expect(writes.every((spy) => spy.mock.calls.length === 0)).toBe(true);
  });

  it('renders a historical day with its changes, exact revision and day cursor', async () => {
    mockCatalog();
    const events = vi
      .spyOn(api, 'getPatientDentalHistory')
      .mockImplementation((_id, options) =>
        options.day
          ? Promise.resolve(eventsPage([editedEvent], 'day-2', 3))
          : Promise.resolve(eventsPage()),
      );
    const snapshot = vi
      .spyOn(api, 'getPatientDentalHistorySnapshot')
      .mockImplementation((_id, options) =>
        Promise.resolve(snapshotPage([conditionItem], options.at ?? null)),
      );
    const { onSelectDay } = renderHistory({ at: day });
    expect(await screen.findByText('Registros guardados hasta el 13 ago 2026')).toBeVisible();
    expect(snapshot).toHaveBeenCalledWith(patientId, expect.objectContaining({ at: day }));
    expect(events).toHaveBeenCalledWith(patientId, expect.objectContaining({ day }));
    expect(screen.getByRole('button', { name: '13 ago 2026' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const changes = screen.getByRole('region', { name: 'Cambios del 13 ago 2026' });
    expect(within(changes).getByText(/Eventos del día: 1 de 3/)).toBeVisible();
    expect(within(changes).getByText('Editada')).toBeVisible();
    expect(within(changes).getByText(/Revisión 2/)).toBeVisible();
    expect(within(changes).getByText('Dra. Alfa')).toBeVisible();
    fireEvent.click(within(changes).getByText('Estado de la revisión'));
    expect(within(changes).getByText('Nota de la revisión')).toBeVisible();
    expect(changes.textContent).toContain('Antes · Pieza 36 · Caries');
    expect(changes.textContent).toContain('Después · Pieza 36 · Caries');
    fireEvent.click(screen.getByRole('button', { name: 'Volver al estado actual' }));
    expect(onSelectDay).toHaveBeenCalledWith(null);
  });

  it('reports partial coverage with its markers and still charts proven revisions', async () => {
    mockCatalog();
    vi.spyOn(api, 'getPatientDentalHistory').mockResolvedValue(eventsPage());
    vi.spyOn(api, 'getPatientDentalHistorySnapshot').mockImplementation((_id, options) =>
      Promise.resolve(
        snapshotPage([conditionItem], options.at ?? null, {
          state: 'partial',
          earliest_recorded_at: '2026-07-01T12:00:00Z',
          warnings: ['missing_initial_revision'],
        }),
      ),
    );
    renderHistory();
    expect(
      await screen.findByText(
        /Cobertura parcial: un registro conocido no conserva su revisión inicial/,
      ),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: 'Odontograma' })).toBeVisible();
  });

  it('shows an honest empty history without chart or completeness claims', async () => {
    mockCatalog();
    vi.spyOn(api, 'getPatientDentalHistory').mockResolvedValue(eventsPage([], null, 0));
    vi.spyOn(api, 'getPatientDentalHistorySnapshot').mockResolvedValue(snapshotPage([]));
    renderHistory();
    expect(await screen.findByText('Sin historial dental registrado')).toBeVisible();
    expect(
      screen.getByText('No hay condiciones ni procedimientos guardados en esta dentición.'),
    ).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Odontograma' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Cobertura parcial/)).not.toBeInTheDocument();
  });

  it('keeps the stale notice and refreshes the same selected day', async () => {
    mockCatalog();
    vi.spyOn(api, 'getPatientDentalHistory').mockResolvedValue(eventsPage());
    const snapshot = vi
      .spyOn(api, 'getPatientDentalHistorySnapshot')
      .mockRejectedValueOnce(new api.ApiError(409, { detail: { code: 'history_changed' } }))
      .mockImplementation((_id, options) =>
        Promise.resolve(snapshotPage([conditionItem], options.at ?? null)),
      );
    renderHistory({ at: day });
    expect(await screen.findByText(/El historial cambió mientras lo leíamos/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar historial' }));
    expect(await screen.findByText('Registros guardados hasta el 13 ago 2026')).toBeVisible();
    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(snapshot).toHaveBeenLastCalledWith(patientId, expect.objectContaining({ at: day }));
  });

  it('validates a malformed date or dentition without reading history', () => {
    mockCatalog();
    const snapshot = vi.spyOn(api, 'getPatientDentalHistorySnapshot');
    const events = vi.spyOn(api, 'getPatientDentalHistory');
    const first = renderHistory({ at: '2026-02-30' });
    expect(
      screen.getByText(
        'La fecha solicitada no es válida. No mostramos el estado actual como ese día.',
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Volver al estado actual' }));
    expect(first.onSelectDay).toHaveBeenCalledWith(null);
    first.view.unmount();
    renderHistory({ dentition: 'mixed' });
    expect(screen.getByText('La dentición solicitada no es válida.')).toBeVisible();
    expect(snapshot).not.toHaveBeenCalled();
    expect(events).not.toHaveBeenCalled();
  });

  it('inspects a historical tooth with revision context and no write callbacks', async () => {
    mockCatalog();
    vi.spyOn(api, 'getPatientDentalHistory').mockResolvedValue(eventsPage());
    vi.spyOn(api, 'getPatientDentalHistorySnapshot').mockImplementation((_id, options) =>
      Promise.resolve(snapshotPage([conditionItem], options.at ?? null)),
    );
    const writes = spyWrites();
    renderHistory({ at: day });
    await screen.findByText('Registros guardados hasta el 13 ago 2026');
    const tooth = screen.getByRole('button', { name: /Pieza 36:/ });
    fireEvent.click(tooth);
    const dialog = await screen.findByRole('dialog', { name: 'Pieza 36' });
    expect(within(dialog).getByText(/Caries/)).toBeVisible();
    expect(within(dialog).getByText(/Revisión 2/)).toBeVisible();
    expect(within(dialog).getByText('Nota de la revisión')).toBeVisible();
    expect(within(dialog).getByText('Dra. Alfa')).toBeVisible();
    for (const pattern of writeControls) {
      expect(within(dialog).queryAllByRole('button', { name: pattern })).toHaveLength(0);
    }
    expect(writes.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(tooth).toHaveFocus();
  });

  it('paginates the loaded window and the day changes with independent cursors', async () => {
    mockCatalog();
    const events = vi.spyOn(api, 'getPatientDentalHistory').mockImplementation((_id, options) => {
      if (options.day) return Promise.resolve(eventsPage([editedEvent], 'day-2', 3));
      if (options.cursor === 'older-1')
        return Promise.resolve(eventsPage([createdOlderEvent], null, 2));
      return Promise.resolve(eventsPage([editedEvent], 'older-1', 2));
    });
    vi.spyOn(api, 'getPatientDentalHistorySnapshot').mockImplementation((_id, options) =>
      Promise.resolve(snapshotPage([conditionItem], options.at ?? null)),
    );
    renderHistory({ at: day });
    await screen.findByText('Registros guardados hasta el 13 ago 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Cargar fechas anteriores' }));
    expect(await screen.findByRole('button', { name: '05 ago 2026' })).toBeVisible();
    expect(events).toHaveBeenLastCalledWith(
      patientId,
      expect.objectContaining({ cursor: 'older-1', epoch }),
    );
    expect(
      within(screen.getByRole('region', { name: 'Eventos registrados' })).getByText(
        /Eventos cargados: 2 de 2/,
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ver más cambios del día' }));
    await waitFor(() =>
      expect(events).toHaveBeenLastCalledWith(
        patientId,
        expect.objectContaining({ day, cursor: 'day-2', epoch }),
      ),
    );
  });
});

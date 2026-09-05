import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { PatientDetail } from './PatientDetail';

const patient: api.Patient = {
  id: 'patient-1',
  first_name: 'Ana',
  last_name: 'Perez',
  rut_masked: '12.***.***-*',
  last_evolution_at: '2026-09-04T23:28:00',
  birth_date: '1990-01-02',
};

const evolutionSummary: api.EvolutionSummary = {
  id: 'evolution-1',
  patient_id: patient.id,
  evolution_at: '2026-09-04T23:28:00',
  preview: 'Control clínico sin complicaciones.',
  created_at: '2026-09-04T23:28:00',
};

const evolutionDetail: api.EvolutionDetail = {
  ...evolutionSummary,
  final_text: 'Motivo / contexto: Control clínico.\n\nHallazgos: Sin hallazgos relevantes.',
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderPatient(path: string, state?: Record<string, unknown>) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/patients/:patientId" element={<PatientDetail />} />
        <Route path="/patients/:patientId/evolutions/:evolutionId" element={<PatientDetail />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('PatientDetail evolution workspace', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockPatientData() {
    vi.spyOn(api, 'getPatient').mockResolvedValue(patient);
    vi.spyOn(api, 'getPatientEvolutions').mockResolvedValue([evolutionSummary]);
  }

  it('selects the newest evolution on patient entry', async () => {
    mockPatientData();
    const getEvolution = vi.spyOn(api, 'getEvolution').mockResolvedValue(evolutionDetail);

    renderPatient('/patients/patient-1');

    expect(await screen.findByRole('heading', { name: 'Evolución dental' })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/patients/patient-1/evolutions/evolution-1',
    );
    expect(screen.getByRole('link', { name: /Ver evolución del/ })).toBeVisible();
    expect(screen.getByText(/\d+ años/)).toBeVisible();
    expect(getEvolution).toHaveBeenCalledWith('evolution-1');
  });

  it('keeps the history list when returning from the mobile detail view', async () => {
    mockPatientData();
    const getEvolution = vi.spyOn(api, 'getEvolution');

    renderPatient('/patients/patient-1', { preserveHistory: true });

    expect(await screen.findByRole('heading', { name: 'Selecciona una evolución' })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/patients/patient-1');
    expect(getEvolution).not.toHaveBeenCalled();
  });

  it('keeps history visible when an evolution is selected', async () => {
    mockPatientData();
    vi.spyOn(api, 'getEvolution').mockResolvedValue(evolutionDetail);

    renderPatient('/patients/patient-1/evolutions/evolution-1');

    expect(await screen.findByRole('heading', { name: 'Evolución dental' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Historial de evoluciones' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Ver evolución del/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('Motivo / contexto')).toBeVisible();
  });

  it('updates the URL when an evolution is selected from the history', async () => {
    mockPatientData();
    vi.spyOn(api, 'getEvolution').mockResolvedValue(evolutionDetail);

    renderPatient('/patients/patient-1', { preserveHistory: true });

    const evolutionLink = await screen.findByRole('link', { name: /Ver evolución del/ });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/patients\/patient-1$/);
    fireEvent.click(evolutionLink);

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/patients/patient-1/evolutions/evolution-1',
      );
    });
    expect(await screen.findByText('Motivo / contexto')).toBeVisible();
  });

  it('shows a recoverable not-found state inside the detail panel', async () => {
    mockPatientData();
    vi.spyOn(api, 'getEvolution').mockRejectedValue(new api.ApiError(404, {}));

    renderPatient('/patients/patient-1/evolutions/missing');

    expect(await screen.findByText('No se encontró esta evolución')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Volver al historial' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Historial de evoluciones' })).toBeVisible();

    fireEvent.click(screen.getByRole('link', { name: 'Volver al historial' }));

    expect(await screen.findByRole('heading', { name: 'Selecciona una evolución' })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/patients\/patient-1$/);
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { NewEvolution } from './NewEvolution';

const patient: api.Patient = {
  id: 'patient-1',
  first_name: 'Ana',
  last_name: 'Perez',
  rut_masked: '12.***.***-*',
  last_evolution_at: null,
  birth_date: '1990-01-02',
};

const draft: api.ClinicalDraft = {
  context: 'Control clínico.',
  findings: 'Sin hallazgos relevantes.',
  assessment: 'Evolución estable.',
  treatment: 'Mantener indicaciones.',
  follow_up: 'Control en seis meses.',
  review_flags: [],
};

function renderNewEvolution() {
  const router = createMemoryRouter(
    [
      { path: '/patients/:patientId/evolutions/new', element: <NewEvolution /> },
      { path: '/patients/:patientId/evolutions/:evolutionId', element: <output>Detalle</output> },
      { path: '/patients/:patientId', element: <output>Paciente</output> },
    ],
    { initialEntries: ['/patients/patient-1/evolutions/new'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

async function enterNote() {
  await screen.findByRole('heading', { name: 'Nueva evolución dental' });
  fireEvent.change(screen.getByLabelText('Nota clínica'), {
    target: { value: 'Paciente refiere sensibilidad al frío.' },
  });
}

describe('NewEvolution generation states', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getPatient').mockResolvedValue(patient);
    vi.spyOn(api, 'getPatientEvolutions').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the success state and enables saving', async () => {
    vi.spyOn(api, 'generateEvolution').mockResolvedValue(draft);
    renderNewEvolution();
    await enterNote();

    fireEvent.click(screen.getByRole('button', { name: 'Generar borrador con IA' }));

    expect(await screen.findByRole('heading', { name: 'Borrador generado' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Guardar evolución' })).toBeEnabled();
  });

  it('renders the partial state with review flags', async () => {
    vi.spyOn(api, 'generateEvolution').mockResolvedValue({
      ...draft,
      review_flags: [{ source_text: 'posible lesión', reason: 'Requiere confirmación' }],
    });
    renderNewEvolution();
    await enterNote();

    fireEvent.click(screen.getByRole('button', { name: 'Generar borrador con IA' }));

    expect(await screen.findByRole('heading', { name: 'Revisa estos puntos' })).toBeVisible();
    expect(screen.getByText('posible lesión')).toBeVisible();
  });

  it('renders insufficient content without empty clinical fields', async () => {
    vi.spyOn(api, 'generateEvolution').mockRejectedValue(
      new api.ApiError(422, {
        detail: {
          code: 'clinical_content_insufficient',
          message: 'insufficient',
        },
      }),
    );
    renderNewEvolution();
    await enterNote();

    fireEvent.click(screen.getByRole('button', { name: 'Generar borrador con IA' }));

    expect(
      await screen.findByText(
        'No encontramos información clínica suficiente para generar un borrador.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Editar nota' })).toBeVisible();
    expect(screen.queryByLabelText('Hallazgos')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nota clínica')).toHaveValue(
      'Paciente refiere sensibilidad al frío.',
    );
  });

  it('keeps the note and exposes recovery actions after a technical failure', async () => {
    vi.spyOn(api, 'generateEvolution').mockRejectedValue(new api.ApiError(502, {}));
    renderNewEvolution();
    await enterNote();

    fireEvent.click(screen.getByRole('button', { name: 'Generar borrador con IA' }));

    expect(await screen.findByText('No pudimos generar el borrador.')).toBeVisible();
    expect(screen.getByText('Tu nota no se perdió.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Seguir editando' })).toBeVisible();
    expect(screen.getByLabelText('Nota clínica')).toHaveValue(
      'Paciente refiere sensibilidad al frío.',
    );
  });

  it('preserves the draft after a save failure and selects a saved evolution on success', async () => {
    vi.spyOn(api, 'generateEvolution').mockResolvedValue(draft);
    const saveEvolution = vi.spyOn(api, 'saveEvolution').mockRejectedValue(new Error('offline'));
    const router = renderNewEvolution();
    await enterNote();
    fireEvent.click(screen.getByRole('button', { name: 'Generar borrador con IA' }));
    await screen.findByRole('heading', { name: 'Borrador generado' });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar evolución' }));

    expect(
      await screen.findByText('No pudimos guardar la evolución. Puedes reintentar.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Nota clínica')).toHaveValue(
      'Paciente refiere sensibilidad al frío.',
    );
    expect(saveEvolution).toHaveBeenCalledOnce();

    saveEvolution.mockResolvedValue({
      id: 'evolution-2',
      patient_id: patient.id,
      evolution_at: '2026-09-05T20:34:00-04:00',
      final_text: 'Control clínico.',
      created_at: '2026-09-05T20:34:00-04:00',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/patients/patient-1/evolutions/evolution-2'),
    );
  });
});

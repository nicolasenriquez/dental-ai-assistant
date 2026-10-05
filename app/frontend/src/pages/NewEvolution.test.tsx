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
    vi.spyOn(api, 'getPatient').mockResolvedValue({ ...patient, phone: null, email: null });
    vi.spyOn(api, 'getPatientEvolutions').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('distinguishes unavailable history from empty history and retries without losing the note', async () => {
    vi.mocked(api.getPatientEvolutions).mockRejectedValueOnce(new Error('offline'));
    renderNewEvolution();
    await enterNote();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar la última evolución.',
    );
    expect(screen.queryByText('Este paciente aún no tiene evoluciones.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generar borrador con IA' })).toBeEnabled();
    vi.mocked(api.getPatientEvolutions).mockResolvedValueOnce([
      {
        id: 'evolution-1',
        patient_id: patient.id,
        evolution_at: '2026-01-01T12:00:00Z',
        created_at: '2026-01-01T12:00:00Z',
        preview: 'Control anterior',
      },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar historial' }));
    expect(await screen.findByText('Control anterior')).toBeVisible();
    expect(screen.getByLabelText('Nota clínica')).toHaveValue(
      'Paciente refiere sensibilidad al frío.',
    );
    expect(screen.queryByRole('button', { name: 'Reintentar historial' })).not.toBeInTheDocument();
  });

  it('uses Chilean date and 24-hour time before generating a draft', async () => {
    renderNewEvolution();
    await enterNote();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar fecha y hora' }));

    let date = screen.getByRole('textbox', { name: 'Fecha de evolución' });
    let time = screen.getByRole('textbox', { name: 'Hora de evolución' });
    expect(date).toHaveAttribute('placeholder', 'dd/mm/aaaa');
    expect(time).toHaveAttribute('placeholder', 'HH:mm');

    fireEvent.change(date, { target: { value: '31/02/2020' } });
    expect(screen.getByRole('button', { name: 'Generar borrador con IA' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa una fecha válida, no futura');
    expect(screen.getByLabelText('Nota clínica')).toHaveValue(
      'Paciente refiere sensibilidad al frío.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar fecha y hora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar fecha y hora' }));
    date = screen.getByRole('textbox', { name: 'Fecha de evolución' });
    time = screen.getByRole('textbox', { name: 'Hora de evolución' });
    expect(date).not.toHaveValue('31/02/2020');

    fireEvent.change(date, { target: { value: '01/01/2999' } });
    expect(screen.getByRole('button', { name: 'Generar borrador con IA' })).toBeDisabled();

    fireEvent.change(date, { target: { value: '01/01/2020' } });
    fireEvent.change(time, { target: { value: '2530' } });
    expect(screen.getByRole('button', { name: 'Generar borrador con IA' })).toBeDisabled();

    fireEvent.change(time, { target: { value: '1530' } });
    expect(time).toHaveValue('15:30');
    expect(screen.getByText('01 ene 2020 · 15:30')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Generar borrador con IA' })).toBeEnabled();
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

  it('reviews a flag-only generation with saving disabled', async () => {
    vi.spyOn(api, 'generateEvolution').mockResolvedValue({
      context: '',
      findings: '',
      assessment: '',
      treatment: '',
      follow_up: '',
      review_flags: [{ source_text: 'ROM leve', reason: 'Requiere interpretación' }],
    });
    renderNewEvolution();
    await enterNote();

    fireEvent.click(screen.getByRole('button', { name: 'Generar borrador con IA' }));

    expect(await screen.findByRole('heading', { name: 'Revisa estos puntos' })).toBeVisible();
    expect(screen.getByText('ROM leve')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Guardar evolución' })).toBeDisabled();
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
    expect(screen.getByRole('dialog', { name: 'Confirmar evolución' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar' }));

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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClinicalPatient, Patient } from '../../lib/api';
import { ClinicalPatientPicker, type ClinicalPatientSelectionState } from './ClinicalPatientPicker';

const patient: ClinicalPatient = {
  id: 'patient-1',
  first_name: 'Ana',
  last_name: 'Pérez',
  rut_masked: '12.345.•••-6',
  birth_date: '1990-01-01',
};

const patients: Patient[] = [{ ...patient, last_evolution_at: null }];

function renderPicker(
  onPatientChange = vi.fn(),
  selectionState: ClinicalPatientSelectionState = 'idle',
  selectionError?: string,
  onRetryPatientChange?: () => void,
) {
  return render(
    <ClinicalPatientPicker
      patient={null}
      patients={patients}
      onPatientChange={onPatientChange}
      selectionState={selectionState}
      selectionError={selectionError}
      onRetryPatientChange={onRetryPatientChange}
    />,
  );
}

describe('ClinicalPatientPicker', () => {
  it('keeps options out of Tab order and restores focus after mouse selection', () => {
    const onPatientChange = vi.fn();
    renderPicker(onPatientChange);
    const trigger = screen.getByRole('button', { name: 'Seleccionar paciente' });
    fireEvent.click(trigger);
    const search = screen.getByRole('combobox');
    const option = screen.getByRole('option');
    expect(option).toHaveAttribute('tabindex', '-1');
    expect(search).toHaveAttribute('aria-activedescendant', option.id);
    fireEvent.click(option);
    expect(trigger).toHaveFocus();
    expect(onPatientChange).toHaveBeenCalledOnce();
  });

  it('closes with Escape from a recovery action', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar paciente' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Nadie' } });
    const clear = screen.getByRole('button', { name: 'Limpiar búsqueda' });
    clear.focus();
    fireEvent.keyDown(clear, { key: 'Escape' });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seleccionar paciente' })).toHaveFocus();
  });

  it.each(['patientsLoading', 'patientsError'] as const)(
    'does not select hidden options during %s',
    (state) => {
      const onPatientChange = vi.fn();
      render(
        <ClinicalPatientPicker
          patient={null}
          patients={patients}
          onPatientChange={onPatientChange}
          {...{ [state]: true }}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Seleccionar paciente' }));
      fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
      expect(onPatientChange).not.toHaveBeenCalled();
    },
  );

  it('filters patients and supports keyboard selection', () => {
    const onPatientChange = vi.fn();
    renderPicker(onPatientChange);

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar paciente' }));
    const search = screen.getByRole('combobox', { name: 'Buscar paciente por nombre o RUT' });
    fireEvent.change(search, { target: { value: 'Ana' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onPatientChange).toHaveBeenCalledWith('patient-1');
  });

  it('keeps empty results stable and closes on outside click', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar paciente' }));
    const search = screen.getByRole('combobox', { name: 'Buscar paciente por nombre o RUT' });
    fireEvent.change(search, { target: { value: 'Nadie' } });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(screen.getByText('No encontramos pacientes para esta búsqueda.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(screen.getByRole('combobox', { name: 'Buscar paciente por nombre o RUT' })).toHaveValue(
      '',
    );
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('keeps the query while the patient list loads or fails', () => {
    const onPatientChange = vi.fn();
    const view = render(
      <ClinicalPatientPicker
        patient={null}
        patients={patients}
        onPatientChange={onPatientChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar paciente' }));
    const search = screen.getByRole('combobox', { name: 'Buscar paciente por nombre o RUT' });
    fireEvent.change(search, { target: { value: 'Ana' } });
    view.rerender(
      <ClinicalPatientPicker
        patient={null}
        patients={patients}
        patientsLoading
        onPatientChange={onPatientChange}
      />,
    );
    expect(search).toHaveValue('Ana');
    expect(screen.getByRole('status')).toHaveTextContent('Cargando pacientes…');
    view.rerender(
      <ClinicalPatientPicker
        patient={null}
        patients={patients}
        patientsError
        onPatientChange={onPatientChange}
      />,
    );
    expect(search).toHaveValue('Ana');
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los pacientes.');
  });

  it('shows the active patient and exposes a clear action', () => {
    const onPatientChange = vi.fn();
    render(
      <ClinicalPatientPicker
        patient={patient}
        patients={patients}
        onPatientChange={onPatientChange}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cambiar paciente activo' })).toHaveTextContent(
      'Ana Pérez · 12.345.•••-6',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Quitar paciente activo' }));
    expect(onPatientChange).toHaveBeenCalledWith(null);
  });

  it('announces a pending selection and disables interaction', () => {
    renderPicker(vi.fn(), 'saving');

    expect(screen.getByRole('status')).toHaveTextContent('Guardando paciente…');
    expect(screen.getByRole('button', { name: 'Seleccionar paciente' })).toBeDisabled();
  });

  it('shows a selection error with a retry action', () => {
    const onRetryPatientChange = vi.fn();
    renderPicker(vi.fn(), 'error', 'No pudimos cambiar el paciente activo.', onRetryPatientChange);

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cambiar el paciente activo.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetryPatientChange).toHaveBeenCalledOnce();
  });

  it('returns focus to the trigger after an outside click', async () => {
    renderPicker();
    const trigger = screen.getByRole('button', { name: 'Seleccionar paciente' });

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

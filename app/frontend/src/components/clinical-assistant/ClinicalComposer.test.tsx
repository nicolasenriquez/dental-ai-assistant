import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ClinicalPatient, Patient } from '../../lib/api';
import { ClinicalComposer } from './ClinicalComposer';

const patient: ClinicalPatient = {
  id: 'patient-1',
  first_name: 'Ana',
  last_name: 'Pérez',
  rut_masked: '12.345.•••-6',
  birth_date: '1990-01-01',
};

const patients: Patient[] = [{ ...patient, last_evolution_at: null }];

function renderComposer(value = '') {
  return render(
    <ClinicalComposer
      patient={patient}
      patients={patients}
      value={value}
      busy={false}
      textareaRef={createRef<HTMLTextAreaElement>()}
      onChange={vi.fn()}
      onPatientChange={vi.fn()}
      onSubmit={vi.fn()}
      voice={{
        state: 'idle',
        elapsed: 0,
        error: null,
        canRetry: false,
        onStart: vi.fn(),
        onStop: vi.fn(),
        onCancel: vi.fn(),
        onRetry: vi.fn(),
      }}
    />,
  );
}

describe('ClinicalComposer', () => {
  it('uses the shared chat shell and keeps clinical controls', () => {
    renderComposer();

    expect(screen.getByTestId('clinical-composer')).toHaveClass('chat-composer');
    expect(screen.getByRole('button', { name: 'Seleccionar paciente activo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar dictado' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
    expect(screen.queryByText('🎙 Dictar')).not.toBeInTheDocument();
  });

  it('filters patients and supports keyboard selection', () => {
    const onPatientChange = vi.fn();
    render(
      <ClinicalComposer
        patient={null}
        patients={patients}
        value=""
        busy={false}
        textareaRef={createRef<HTMLTextAreaElement>()}
        onChange={vi.fn()}
        onPatientChange={onPatientChange}
        onSubmit={vi.fn()}
        voice={{
          state: 'idle',
          elapsed: 0,
          error: null,
          canRetry: false,
          onStart: vi.fn(),
          onStop: vi.fn(),
          onCancel: vi.fn(),
          onRetry: vi.fn(),
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar paciente activo' }));
    const search = screen.getByRole('combobox', { name: 'Buscar paciente por nombre o RUT' });
    fireEvent.change(search, { target: { value: 'Ana' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onPatientChange).toHaveBeenCalledWith('patient-1');
  });

  it('keeps empty results stable and closes on outside click', () => {
    renderComposer();
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar paciente activo' }));
    const search = screen.getByRole('combobox', { name: 'Buscar paciente por nombre o RUT' });
    fireEvent.change(search, { target: { value: 'Nadie' } });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByText('No se encontraron pacientes.')).toBeVisible();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('uses the shared send control for a typed clinical note', () => {
    const onSubmit = vi.fn();
    render(
      <ClinicalComposer
        patient={patient}
        patients={patients}
        value="Nota clínica"
        busy={false}
        textareaRef={createRef<HTMLTextAreaElement>()}
        onChange={vi.fn()}
        onPatientChange={vi.fn()}
        onSubmit={onSubmit}
        voice={{
          state: 'idle',
          elapsed: 0,
          error: null,
          canRetry: false,
          onStart: vi.fn(),
          onStop: vi.fn(),
          onCancel: vi.fn(),
          onRetry: vi.fn(),
        }}
      />,
    );

    const send = screen.getByRole('button', { name: 'Enviar mensaje' });
    expect(send).not.toBeDisabled();
    fireEvent.click(send);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('keeps note editable but locks patient and submit controls during transcription', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(
      <ClinicalComposer
        patient={patient}
        patients={patients}
        value="Nota existente"
        busy={false}
        textareaRef={createRef<HTMLTextAreaElement>()}
        onChange={onChange}
        onPatientChange={vi.fn()}
        onSubmit={onSubmit}
        voice={{
          state: 'transcribing',
          elapsed: 0,
          error: null,
          canRetry: false,
          onStart: vi.fn(),
          onStop: vi.fn(),
          onCancel: vi.fn(),
          onRetry: vi.fn(),
        }}
        submitDisabled
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Nota clínica' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Seleccionar paciente activo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Quitar paciente activo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
    expect(screen.getByText('Transcribiendo… Puedes seguir editando.')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Nota clínica' }), {
      target: { value: 'Nota editada' },
    });
    expect(onChange).toHaveBeenCalledWith('Nota editada');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Nota clínica' }), {
      key: 'Enter',
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

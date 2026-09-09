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
      onVoice={vi.fn()}
      onStopVoice={vi.fn()}
      onCancelVoice={vi.fn()}
      onRetryVoice={vi.fn()}
      voiceState="idle"
      voiceElapsed={0}
      voiceError={null}
    />,
  );
}

describe('ClinicalComposer', () => {
  it('uses the shared chat shell and keeps clinical controls', () => {
    renderComposer();

    expect(screen.getByTestId('clinical-composer')).toHaveClass('chat-composer');
    expect(screen.getByLabelText('Seleccionar paciente activo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dictar nota' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
    expect(screen.queryByText('🎙 Dictar')).not.toBeInTheDocument();
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
        onVoice={vi.fn()}
        onStopVoice={vi.fn()}
        onCancelVoice={vi.fn()}
        onRetryVoice={vi.fn()}
        voiceState="idle"
        voiceElapsed={0}
        voiceError={null}
      />,
    );

    const send = screen.getByRole('button', { name: 'Enviar mensaje' });
    expect(send).not.toBeDisabled();
    fireEvent.click(send);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

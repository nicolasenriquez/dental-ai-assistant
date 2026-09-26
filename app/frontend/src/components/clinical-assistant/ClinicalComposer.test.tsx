import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ClinicalPatient } from '../../lib/api';
import { ClinicalComposer } from './ClinicalComposer';

const patient: ClinicalPatient = {
  id: 'patient-1',
  first_name: 'Ana',
  last_name: 'Pérez',
  rut_masked: '12.345.•••-6',
  birth_date: '1990-01-01',
};

function renderComposer(value = '') {
  return render(
    <ClinicalComposer
      patient={patient}
      value={value}
      textareaRef={createRef<HTMLTextAreaElement>()}
      onChange={vi.fn()}
      onSubmit={vi.fn()}
      primaryAction="send"
      onPrimaryAction={vi.fn()}
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
    expect(screen.getByRole('button', { name: 'Iniciar dictado' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
    expect(screen.queryByText('🎙 Dictar')).not.toBeInTheDocument();
  });

  it('uses the shared send control for a typed clinical note', () => {
    const onSubmit = vi.fn();
    render(
      <ClinicalComposer
        patient={patient}
        value="Nota clínica"
        textareaRef={createRef<HTMLTextAreaElement>()}
        onChange={vi.fn()}
        onSubmit={onSubmit}
        primaryAction="send"
        onPrimaryAction={onSubmit}
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

  it('keeps Stop fixed while Enter and Encolar queue the next message', () => {
    const onSubmit = vi.fn();
    const onStop = vi.fn();
    render(
      <ClinicalComposer
        patient={patient}
        value="Siguiente nota"
        textareaRef={createRef<HTMLTextAreaElement>()}
        onChange={vi.fn()}
        onSubmit={onSubmit}
        primaryAction="stop"
        onPrimaryAction={onStop}
        queueAvailable
        onQueue={onSubmit}
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
    const composer = screen.getByRole('textbox', { name: 'Nota clínica' });
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(composer, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Encolar' }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Detener respuesta' }));
    expect(onStop).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Enviar mensaje' })).not.toBeInTheDocument();
  });

  it('keeps note editable but locks submit controls during transcription', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(
      <ClinicalComposer
        patient={patient}
        value="Nota existente"
        textareaRef={createRef<HTMLTextAreaElement>()}
        onChange={onChange}
        onSubmit={onSubmit}
        primaryAction="send"
        onPrimaryAction={onSubmit}
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
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
    expect(screen.getByText('Transcribiendo dictado…')).toBeVisible();
    expect(screen.getByTestId('clinical-composer')).toHaveClass('chat-composer--voice-layout');
    fireEvent.change(screen.getByRole('textbox', { name: 'Nota clínica' }), {
      target: { value: 'Nota editada' },
    });
    expect(onChange).toHaveBeenCalledWith('Nota editada');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Nota clínica' }), {
      key: 'Enter',
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps existing text visible and editable while recording', () => {
    const onStop = vi.fn();
    render(
      <ClinicalComposer
        patient={patient}
        value="Nota existente"
        textareaRef={createRef<HTMLTextAreaElement>()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        primaryAction="send"
        onPrimaryAction={vi.fn()}
        voice={{
          state: 'recording',
          elapsed: 14_000,
          error: null,
          canRetry: false,
          stream: null,
          onStart: vi.fn(),
          onStop,
          onCancel: vi.fn(),
          onRetry: vi.fn(),
        }}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Nota clínica' })).toHaveValue('Nota existente');
    expect(screen.getByRole('textbox', { name: 'Nota clínica' })).not.toHaveAttribute('readonly');
    expect(screen.getByText('00:14')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Detener grabación' }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('cancels voice on Escape and ignores Enter during IME composition', () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    render(
      <ClinicalComposer
        patient={patient}
        value="Nota"
        textareaRef={createRef<HTMLTextAreaElement>()}
        onChange={vi.fn()}
        onSubmit={onSubmit}
        primaryAction="send"
        onPrimaryAction={onSubmit}
        voice={{
          state: 'recording',
          elapsed: 0,
          error: null,
          canRetry: false,
          onStart: vi.fn(),
          onStop: vi.fn(),
          onCancel,
          onRetry: vi.fn(),
        }}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Nota clínica' });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps voice controls independent from agent runtime controls', () => {
    const onCancel = vi.fn();
    render(
      <ClinicalComposer
        patient={patient}
        value="Nota"
        textareaRef={createRef<HTMLTextAreaElement>()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        primaryAction="send"
        onPrimaryAction={vi.fn()}
        voice={{
          state: 'recording',
          elapsed: 0,
          error: null,
          canRetry: false,
          onStart: vi.fn(),
          onStop: vi.fn(),
          onCancel,
          onRetry: vi.fn(),
        }}
      />,
    );
    const stop = screen.getByRole('button', { name: 'Detener grabación' });
    fireEvent.keyDown(stop, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Detener respuesta' })).not.toBeInTheDocument();
  });
});

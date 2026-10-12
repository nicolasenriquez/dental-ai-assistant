import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { VoiceState } from '../../hooks/useVoiceDictation';
import type { ComposerContextItem } from '../../lib/api';
import {
  ClinicalComposer,
  type ClinicalComposerOrigin,
  type ClinicalVoiceControls,
} from './ClinicalComposer';

const patientOrigin: ClinicalComposerOrigin = { label: 'Ana Pérez', retained: false };

const longNote = Array.from(
  { length: 32 },
  (_, index) => `Línea ${index + 1}: hallazgo clínico sin cambios.`,
).join('\n');

const attachedSources: ComposerContextItem[] = [
  'informe_ortodoncia_revision_v12.pdf',
  'informe_ortodoncia_revision_v13.pdf',
  'radiografía_panorámica_2026.png',
  'consentimiento_informado.pdf',
  'laboratorio_provisional.pdf',
].map((sourceName, index) => ({
  id: `source-${index + 1}`,
  kind: 'drive_selection',
  sourceId: `file-${index + 1}`,
  sourceName,
  content: `Contenido sintético ${index + 1}`,
}));

const suffixOnlySources: ComposerContextItem[] = ['revision_v12.pdf', 'revision_v13.pdf'].map(
  (suffix, index) => ({
    id: `source-suffix-${index + 12}`,
    kind: 'drive_selection' as const,
    sourceId: `file-suffix-${index + 12}`,
    sourceName: `informe_consolidado_ortodoncia_paciente_qa_2026_seguimiento_trimestral_${suffix}`,
    content: `Contenido sintético ${index + 1}`,
  }),
);

const acceptedLimitUnbrokenName = 'evaluacion_clinica_extensa_'.repeat(20).slice(0, 500);
const acceptedLimitSource: ComposerContextItem = {
  id: 'source-limit',
  kind: 'drive_selection',
  sourceId: 'file-limit',
  sourceName: acceptedLimitUnbrokenName,
  content: 'Contenido sintético del documento extenso.',
};

function voiceControls(
  state: VoiceState,
  overrides: Partial<ClinicalVoiceControls> = {},
): ClinicalVoiceControls {
  return {
    state,
    elapsed: 0,
    error: null,
    canRetry: false,
    onStart: vi.fn(),
    onStop: vi.fn(),
    onCancel: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

function renderComposer(value = '') {
  return render(
    <ClinicalComposer
      origin={patientOrigin}
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
        origin={patientOrigin}
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
        origin={patientOrigin}
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
    fireEvent.click(screen.getByRole('button', { name: 'Detener respuesta actual' }));
    expect(onStop).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Enviar mensaje' })).not.toBeInTheDocument();
  });

  it('summarizes the keyboard keys without adding another control', () => {
    renderComposer();

    const hint = screen.getByText(/Enter envía/);
    expect(hint).toHaveAttribute('id', 'clinical-composer-keys');
    expect(hint).toHaveTextContent('Shift+Enter agrega una línea');
    expect(screen.getByRole('textbox', { name: 'Nota clínica' })).toHaveAttribute(
      'aria-describedby',
      'clinical-composer-keys',
    );
  });

  it('announces a retained patient origin instead of the active patient', () => {
    render(
      <ClinicalComposer
        origin={{ label: 'Ana Pérez', retained: true }}
        value="Nota para Ana"
        textareaRef={createRef<HTMLTextAreaElement>()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        primaryAction="send"
        onPrimaryAction={vi.fn()}
        voice={voiceControls('idle')}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Borrador para Ana Pérez' });
    expect(input).toHaveValue('Nota para Ana');
    expect(input).toHaveAttribute('placeholder', 'Continúa el borrador para Ana Pérez…');
    expect(
      screen.getByText(/^Borrador para Ana Pérez\. Vuelve a este contexto para enviar\.$/),
    ).toBeVisible();
  });

  it('keeps retained general work explicitly general', () => {
    render(
      <ClinicalComposer
        origin={{ label: null, retained: true }}
        value="Consulta general"
        textareaRef={createRef<HTMLTextAreaElement>()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        primaryAction="send"
        onPrimaryAction={vi.fn()}
        voice={voiceControls('idle')}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Borrador sin paciente' });
    expect(input).toHaveValue('Consulta general');
    expect(input).toHaveAttribute('placeholder', 'Continúa el borrador sin paciente…');
    expect(
      screen.getByText(/^Borrador sin paciente\. Vuelve a este contexto para enviar\.$/),
    ).toBeVisible();
  });

  it('keeps note editable but locks submit controls during transcription', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(
      <ClinicalComposer
        origin={patientOrigin}
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
    expect(screen.queryByRole('button', { name: 'Enviar mensaje' })).not.toBeInTheDocument();
    expect(screen.getByText('Transcribiendo dictado…')).toBeVisible();
    expect(screen.getByTestId('clinical-composer')).toHaveClass('is-voice-active');
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
        origin={patientOrigin}
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
        origin={patientOrigin}
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
        origin={patientOrigin}
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

  it('keeps long text, removable sources and every required control usable together', () => {
    const onRemoveContext = vi.fn();
    const onSubmit = vi.fn();
    render(
      <ClinicalComposer
        origin={patientOrigin}
        value={longNote}
        textareaRef={createRef<HTMLTextAreaElement>()}
        onChange={vi.fn()}
        onSubmit={onSubmit}
        primaryAction="send"
        onPrimaryAction={onSubmit}
        queueAvailable
        onQueue={onSubmit}
        contextItems={attachedSources}
        onRemoveContext={onRemoveContext}
        voice={voiceControls('idle')}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Nota clínica' });
    expect(input).toHaveValue(longNote);
    for (const source of attachedSources) {
      expect(screen.getByRole('button', { name: `Quitar ${source.sourceName}` })).toBeVisible();
    }

    const removed = attachedSources[3];
    fireEvent.click(screen.getByRole('button', { name: `Quitar ${removed.sourceName}` }));
    expect(onRemoveContext).toHaveBeenCalledTimes(1);
    expect(onRemoveContext).toHaveBeenCalledWith(removed.id);

    expect(input).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Encolar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Iniciar dictado' })).toBeEnabled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('keeps suffix-only and accepted-limit source names complete with their exact removal actions', () => {
    const onRemoveContext = vi.fn();
    render(
      <ClinicalComposer
        origin={patientOrigin}
        value=""
        textareaRef={createRef<HTMLTextAreaElement>()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        primaryAction="send"
        onPrimaryAction={vi.fn()}
        contextItems={[...suffixOnlySources, acceptedLimitSource]}
        onRemoveContext={onRemoveContext}
        voice={voiceControls('idle')}
      />,
    );

    expect(acceptedLimitSource.sourceName).toHaveLength(500);
    for (const source of [...suffixOnlySources, acceptedLimitSource]) {
      expect(screen.getByText(`${source.sourceName} · Google Drive`)).toBeVisible();
      expect(screen.getByRole('button', { name: `Quitar ${source.sourceName}` })).toBeVisible();
    }

    fireEvent.click(
      screen.getByRole('button', { name: `Quitar ${suffixOnlySources[1].sourceName}` }),
    );
    expect(onRemoveContext).toHaveBeenCalledTimes(1);
    expect(onRemoveContext).toHaveBeenCalledWith(suffixOnlySources[1].id);
  });

  const remainingVoiceStates: VoiceState[] = [
    'requesting_permission',
    'stopping',
    'success',
    'cancelled',
    'error',
  ];

  it.each(remainingVoiceStates)('keeps the composer operable in the %s voice state', (state) => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(
      <ClinicalComposer
        origin={patientOrigin}
        value="Nota clínica con trabajo sin enviar"
        textareaRef={createRef<HTMLTextAreaElement>()}
        onChange={onChange}
        onSubmit={onSubmit}
        primaryAction="send"
        onPrimaryAction={onSubmit}
        voice={voiceControls(state, {
          elapsed: state === 'stopping' ? 9_000 : 0,
          error: state === 'error' ? 'No se pudo transcribir el audio.' : null,
          canRetry: state === 'error',
        })}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Nota clínica' });
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: 'Nota clínica editada' } });
    expect(onChange).toHaveBeenCalledWith('Nota clínica editada');
    expect(onSubmit).not.toHaveBeenCalled();

    if (state === 'requesting_permission') {
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeVisible();
    } else if (state === 'stopping') {
      expect(screen.getByText('Finalizando grabación…')).toBeVisible();
    } else if (state === 'success') {
      expect(screen.getByText('Dictado añadido')).toBeVisible();
    } else if (state === 'cancelled') {
      expect(screen.getByRole('button', { name: 'Iniciar dictado' })).toBeVisible();
    } else {
      expect(screen.getByRole('alert')).toHaveTextContent('No se pudo transcribir el audio.');
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Descartar' })).toBeVisible();
    }
  });

  it('preserves the caret, selection and draft while the composer rerenders for a reflow', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const recording = voiceControls('recording');
    const textareaRef = createRef<HTMLTextAreaElement>();
    const { rerender } = render(
      <ClinicalComposer
        origin={patientOrigin}
        value={longNote}
        textareaRef={textareaRef}
        onChange={onChange}
        onSubmit={onSubmit}
        primaryAction="send"
        onPrimaryAction={onSubmit}
        voice={recording}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Nota clínica' }) as HTMLTextAreaElement;
    input.focus();
    input.setSelectionRange(5, 24);

    act(() => {
      rerender(
        <ClinicalComposer
          origin={patientOrigin}
          value={longNote}
          textareaRef={textareaRef}
          onChange={onChange}
          onSubmit={onSubmit}
          primaryAction="send"
          onPrimaryAction={onSubmit}
          voice={voiceControls('transcribing')}
        />,
      );
    });

    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(5);
    expect(input.selectionEnd).toBe(24);
    expect(input).toHaveValue(longNote);
    expect(onChange).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(recording.onCancel).not.toHaveBeenCalled();
  });
});

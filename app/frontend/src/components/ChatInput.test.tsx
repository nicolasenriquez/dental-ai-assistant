import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatInput } from './ChatInput';

describe('ChatInput', () => {
  describe('Send/Stop button rendering', () => {
    it('shows Send button when not streaming', () => {
      render(<ChatInput onSend={vi.fn()} isStreaming={false} />);
      expect(screen.getByRole('button', { name: /enviar/i })).toBeInTheDocument();
    });

    it('shows queue and Stop buttons when streaming', () => {
      render(<ChatInput onSend={vi.fn()} isStreaming={true} />);
      expect(screen.getByRole('button', { name: /detener/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /poner mensaje en cola/i })).toBeInTheDocument();
    });

    it('Stop button calls onStop when clicked', () => {
      const onStop = vi.fn();
      render(<ChatInput onSend={vi.fn()} isStreaming={true} onStop={onStop} />);
      fireEvent.click(screen.getByRole('button', { name: /detener/i }));
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('Send button calls onSend when clicked', () => {
      const onSend = vi.fn();
      render(<ChatInput onSend={onSend} isStreaming={false} />);
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
      expect(onSend).toHaveBeenCalledWith('Hello');
    });

    it('input remains editable while streaming', () => {
      render(<ChatInput onSend={vi.fn()} isStreaming={true} />);
      expect(screen.getByRole('textbox')).not.toBeDisabled();
    });

    it('input is not disabled when not streaming', () => {
      render(<ChatInput onSend={vi.fn()} isStreaming={false} />);
      expect(screen.getByRole('textbox')).not.toBeDisabled();
    });

    it('shows correct placeholder when streaming', () => {
      render(<ChatInput onSend={vi.fn()} isStreaming={true} />);
      expect(screen.getByRole('textbox')).toHaveAttribute(
        'placeholder',
        'Escribe un mensaje para enviarlo después…',
      );
    });

    it('shows correct placeholder when not streaming', () => {
      render(<ChatInput onSend={vi.fn()} isStreaming={false} />);
      expect(screen.getByRole('textbox')).toHaveAttribute(
        'placeholder',
        'Pregunta sobre la biblioteca de videos…',
      );
    });

    it('does not throw when onStop is not provided during streaming', () => {
      render(<ChatInput onSend={vi.fn()} isStreaming={true} />);
      // Stop button exists but has no handler - clicking should not throw
      const stopBtn = screen.getByRole('button', { name: /detener/i });
      expect(() => fireEvent.click(stopBtn)).not.toThrow();
    });

    it('keeps the draft when the parent rejects the send', () => {
      render(<ChatInput onSend={() => false} />);
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'Queued twice' } });
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
      expect(input).toHaveValue('Queued twice');
    });

    it('resizes when a controlled draft changes', () => {
      const onValueChange = vi.fn();
      const view = render(
        <ChatInput value="Short" onValueChange={onValueChange} onSend={vi.fn()} />,
      );
      const input = screen.getByRole('textbox');
      Object.defineProperty(input, 'scrollHeight', { configurable: true, value: 120 });

      view.rerender(
        <ChatInput
          value={'A long restored draft\nwith several lines'}
          onValueChange={onValueChange}
          onSend={vi.fn()}
        />,
      );

      expect(input).toHaveStyle({ height: '120px' });
    });

    it('keeps chat draft editable but blocks submit during transcription', () => {
      const onSend = vi.fn();
      const onValueChange = vi.fn();
      render(
        <ChatInput
          value="Draft"
          onValueChange={onValueChange}
          onSend={onSend}
          voiceState="transcribing"
          voiceElapsed={0}
          voiceError={null}
          voiceCanRetry={false}
          onVoice={vi.fn()}
          onStopVoice={vi.fn()}
          onCancelVoice={vi.fn()}
          onRetryVoice={vi.fn()}
          submitDisabled
        />,
      );

      const input = screen.getByRole('textbox');
      expect(input).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
      fireEvent.change(input, { target: { value: 'Edited draft' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onValueChange).toHaveBeenCalledWith('Edited draft');
      expect(onSend).not.toHaveBeenCalled();
      expect(screen.getByText('Transcribiendo dictado… Puedes seguir editando.')).toBeVisible();
    });

    it('exposes voice controls while recording', () => {
      const onStopVoice = vi.fn();
      const onCancelVoice = vi.fn();
      render(
        <ChatInput
          onSend={vi.fn()}
          voiceState="recording"
          voiceElapsed={1_000}
          voiceError={null}
          voiceCanRetry={false}
          onVoice={vi.fn()}
          onStopVoice={onStopVoice}
          onCancelVoice={onCancelVoice}
          onRetryVoice={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: 'Detener grabación' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Cancelar dictado' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'Detener grabación' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar dictado' }));
      expect(onStopVoice).toHaveBeenCalledTimes(1);
      expect(onCancelVoice).toHaveBeenCalledTimes(1);
    });
  });
});

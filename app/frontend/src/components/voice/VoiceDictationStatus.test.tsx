import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VoiceDictationStatus } from './VoiceDictationStatus';

function renderStatus(voiceState: 'recording' | 'transcribing' | 'error') {
  return render(
    <VoiceDictationStatus
      voiceState={voiceState}
      voiceElapsed={14_000}
      voiceError={voiceState === 'error' ? 'No pudimos transcribir esta grabación.' : null}
      canRetry={voiceState === 'error'}
      onStartVoice={vi.fn()}
      onStopVoice={vi.fn()}
      onCancelVoice={vi.fn()}
      onRetryVoice={vi.fn()}
    />,
  );
}

describe('VoiceDictationStatus', () => {
  it('keeps Cancel and Stop as separate labelled controls while recording', () => {
    const onCancel = vi.fn();
    const onStop = vi.fn();
    render(
      <VoiceDictationStatus
        voiceState="recording"
        voiceElapsed={14_000}
        voiceError={null}
        canRetry={false}
        onStopVoice={onStop}
        onCancelVoice={onCancel}
        onRetryVoice={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Grabando')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar dictado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Detener grabación' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('communicates slow transcription without inventing progress', () => {
    vi.useFakeTimers();
    try {
      renderStatus('transcribing');
      expect(screen.getByText('Transcribiendo dictado…')).toBeVisible();

      act(() => vi.advanceTimersByTime(4_000));
      expect(screen.getByText('Transcribiendo audio… Puedes seguir editando.')).toBeVisible();

      act(() => vi.advanceTimersByTime(6_000));
      expect(screen.getByText('Sigue transcribiendo…')).toBeVisible();
      expect(screen.getByText('Puedes seguir editando.')).toBeVisible();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('announces errors as alerts', () => {
    renderStatus('error');
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });
});

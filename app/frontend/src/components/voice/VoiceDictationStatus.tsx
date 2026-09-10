import { Check, Mic, Square, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { VoiceState } from '../../hooks/useVoiceDictation';
import { Spinner } from '../Spinner';
import { VoiceWaveform } from './VoiceWaveform';

export interface VoiceDictationStatusProps {
  voiceState: VoiceState;
  voiceElapsed: number;
  voiceError: string | null;
  canRetry: boolean;
  stream?: MediaStream | null;
  onStartVoice?: () => void;
  onStopVoice: () => void;
  onCancelVoice: () => void;
  onRetryVoice: () => void;
}

export function VoiceDictationStatus({
  voiceState,
  voiceElapsed,
  voiceError,
  canRetry,
  stream,
  onStartVoice,
  onStopVoice,
  onCancelVoice,
  onRetryVoice,
}: VoiceDictationStatusProps) {
  const seconds = Math.floor(voiceElapsed / 1000);
  const timer = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  const [transcriptionElapsed, setTranscriptionElapsed] = useState(0);

  useEffect(() => {
    if (voiceState !== 'transcribing') {
      setTranscriptionElapsed(0);
      return;
    }

    const startedAt = Date.now();
    const updateElapsed = () => setTranscriptionElapsed(Date.now() - startedAt);
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(interval);
  }, [voiceState]);

  const transcriptionSeconds = Math.floor(transcriptionElapsed / 1000);
  const transcriptionTimer = `${Math.floor(transcriptionSeconds / 60)
    .toString()
    .padStart(2, '0')}:${(transcriptionSeconds % 60).toString().padStart(2, '0')}`;
  const isError = voiceState === 'error';

  return (
    <div
      className={`voice-composer-status is-${voiceState}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <div className="voice-composer-status__content">
        {voiceState === 'recording' ? (
          <>
            <span className="clinical-recording-dot" aria-hidden="true" />
            <strong>Grabando</strong>
            <VoiceWaveform stream={stream ?? null} />
            <time aria-hidden="true">{timer}</time>
            <button
              type="button"
              onClick={onCancelVoice}
              title="Cancelar dictado · Esc"
              aria-label="Cancelar dictado"
            >
              Cancelar
            </button>
          </>
        ) : voiceState === 'stopping' ? (
          <>
            <Spinner />
            <span>Preparando audio…</span>
            <time aria-hidden="true">{timer}</time>
          </>
        ) : voiceState === 'transcribing' ? (
          <>
            <Spinner />
            {transcriptionElapsed < 4_000 ? (
              <span>Transcribiendo dictado…</span>
            ) : transcriptionElapsed < 10_000 ? (
              <span>Transcribiendo audio… Puedes seguir editando.</span>
            ) : (
              <>
                <span>Sigue transcribiendo…</span>
                <time>{transcriptionTimer}</time>
                <span>Puedes seguir editando.</span>
              </>
            )}
            <button
              type="button"
              className="voice-composer-status__cancel"
              onClick={onCancelVoice}
              aria-label="Cancelar dictado"
            >
              Cancelar
            </button>
          </>
        ) : voiceState === 'success' ? (
          <>
            <Check aria-hidden="true" size={16} />
            <span>Dictado añadido</span>
          </>
        ) : voiceError ? (
          <>
            <TriangleAlert aria-hidden="true" size={16} />
            <span>{voiceError}</span>
            <button type="button" onClick={onCancelVoice}>
              Descartar
            </button>
            {canRetry && (
              <button type="button" onClick={onRetryVoice}>
                Reintentar
              </button>
            )}
          </>
        ) : voiceState === 'requesting_permission' ? (
          <>
            <Spinner />
            <span>Solicitando acceso al micrófono…</span>
            <button type="button" onClick={onCancelVoice}>
              Cancelar
            </button>
          </>
        ) : onStartVoice ? (
          <button
            type="button"
            className="clinical-dictation-button"
            onClick={onStartVoice}
            aria-label="Iniciar dictado"
          >
            <Mic size={15} aria-hidden="true" /> Dictar
          </button>
        ) : null}
      </div>
      {voiceState === 'recording' && (
        <button
          type="button"
          className="voice-composer-status__action"
          onClick={onStopVoice}
          aria-label="Detener grabación"
          title="Detener dictado"
        >
          <Square aria-hidden="true" size={14} fill="currentColor" />
          <span>Detener</span>
        </button>
      )}
    </div>
  );
}

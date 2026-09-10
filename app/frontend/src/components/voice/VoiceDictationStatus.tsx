import { Check, Mic, Square, TriangleAlert } from 'lucide-react';
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

  return (
    <div className={`voice-composer-status is-${voiceState}`}>
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
            <span>Transcribiendo dictado… Puedes seguir editando.</span>
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
      {!onStartVoice && voiceState === 'recording' && (
        <button
          type="button"
          className="voice-composer-status__action"
          onClick={onStopVoice}
          aria-label="Detener grabación"
        >
          <Square aria-hidden="true" size={14} fill="currentColor" />
        </button>
      )}
    </div>
  );
}

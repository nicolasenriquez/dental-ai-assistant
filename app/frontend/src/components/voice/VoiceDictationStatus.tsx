import type { VoiceState } from '../../hooks/useVoiceDictation';
import { Spinner } from '../Spinner';

export interface VoiceDictationStatusProps {
  voiceState: VoiceState;
  voiceElapsed: number;
  voiceError: string | null;
  canRetry: boolean;
  onStopVoice: () => void;
  onCancelVoice: () => void;
  onRetryVoice: () => void;
}

export function VoiceDictationStatus({
  voiceState,
  voiceElapsed,
  voiceError,
  canRetry,
  onStopVoice,
  onCancelVoice,
  onRetryVoice,
}: VoiceDictationStatusProps) {
  return (
    <>
      {voiceState === 'requesting_permission' && (
        <div
          className="clinical-voice-status voice-dictation-status"
          role="status"
          aria-live="polite"
        >
          <Spinner />
          <span>Solicitando acceso al micrófono…</span>
          <button
            type="button"
            className="clinical-secondary-button"
            onClick={onCancelVoice}
            aria-label="Cancelar dictado"
          >
            Cancelar
          </button>
        </div>
      )}
      {(voiceState === 'recording' || voiceState === 'stopping') && (
        <div
          className="clinical-voice-state voice-dictation-state"
          role="status"
          aria-live="polite"
        >
          <strong>
            {voiceState === 'stopping' ? (
              <>
                <Spinner /> Preparando audio…
              </>
            ) : (
              <>
                <span className="clinical-recording-dot" aria-hidden="true" /> Grabando
              </>
            )}
          </strong>
          <span>
            {Math.floor(voiceElapsed / 1000)
              .toString()
              .padStart(2, '0')}
            s
          </span>
          <small>Habla con naturalidad.</small>
          <div className="clinical-voice-actions">
            <button
              type="button"
              className="clinical-secondary-button"
              onClick={onCancelVoice}
              disabled={voiceState === 'stopping'}
              aria-label="Cancelar dictado"
            >
              Cancelar
            </button>
            <button
              type="button"
              className="clinical-primary-button"
              onClick={onStopVoice}
              disabled={voiceState === 'stopping'}
              aria-label="Detener grabación"
            >
              {voiceState === 'stopping' ? (
                <>
                  <Spinner /> Terminando…
                </>
              ) : (
                'Terminar'
              )}
            </button>
          </div>
        </div>
      )}
      {voiceState === 'transcribing' && (
        <p
          className="clinical-voice-status voice-dictation-status"
          role="status"
          aria-live="polite"
        >
          <Spinner />
          <span>Transcribiendo… Puedes seguir editando.</span>
        </p>
      )}
      {voiceError && (
        <div className="clinical-voice-recovery voice-dictation-recovery" role="alert">
          <p className="clinical-voice-error">{voiceError}</p>
          <div className="clinical-voice-actions">
            <button
              type="button"
              className="clinical-secondary-button"
              onClick={onCancelVoice}
              aria-label="Cancelar dictado"
            >
              Descartar
            </button>
            {canRetry && (
              <button type="button" className="clinical-primary-button" onClick={onRetryVoice}>
                Reintentar transcripción
              </button>
            )}
          </div>
        </div>
      )}
      {voiceState === 'success' && (
        <p className="clinical-voice-status voice-dictation-status" role="status">
          Dictado añadido.
        </p>
      )}
    </>
  );
}

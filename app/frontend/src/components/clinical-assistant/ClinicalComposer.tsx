import { ListPlus, Square } from 'lucide-react';
import { type KeyboardEvent, type RefObject, useState } from 'react';
import { useAutosizeTextarea } from '../../hooks/useAutosizeTextarea';
import { type VoiceState, isVoiceInFlight } from '../../hooks/useVoiceDictation';
import type { ClinicalPatient } from '../../lib/api';
import { ComposerShell } from '../ComposerShell';
import { VoiceDictationStatus } from '../voice/VoiceDictationStatus';

export interface ClinicalVoiceControls {
  state: VoiceState;
  elapsed: number;
  error: string | null;
  canRetry: boolean;
  stream?: MediaStream | null;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

interface ClinicalComposerProps {
  patient: ClinicalPatient | null;
  value: string;
  busy: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  stopping?: boolean;
  voice: ClinicalVoiceControls;
  submitDisabled?: boolean;
}

export function ClinicalComposer({
  patient,
  value,
  busy,
  textareaRef,
  onChange,
  onSubmit,
  onStop,
  stopping = false,
  voice,
  submitDisabled = false,
}: ClinicalComposerProps) {
  const [focused, setFocused] = useState(false);
  const voiceInFlight = isVoiceInFlight(voice.state);
  const voiceStatusLayout = voice.state !== 'idle' && voice.state !== 'success';
  useAutosizeTextarea({ ref: textareaRef, value });
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape' && voiceInFlight) {
      event.preventDefault();
      voice.onCancel();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      if (submitDisabled || voiceInFlight) return;
      onSubmit();
    }
  };

  return (
    <ComposerShell
      className={`clinical-composer${voiceStatusLayout ? ' chat-composer--voice-layout' : ''}`}
      focused={focused}
      testId="clinical-composer"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && voiceInFlight) {
          event.preventDefault();
          voice.onCancel();
        }
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') onKeyDown(event);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={1}
        aria-label="Nota clínica"
        placeholder={
          patient ? 'Escribe o dicta la nota clínica…' : 'Escribe un mensaje o elige un paciente…'
        }
        className="chat-composer-input clinical-composer-input"
        aria-busy={voice.state === 'transcribing'}
      />
      <VoiceDictationStatus
        voiceState={voice.state}
        voiceElapsed={voice.elapsed}
        voiceError={voice.error}
        canRetry={voice.canRetry}
        stream={voice.stream ?? null}
        onStartVoice={voice.onStart}
        onStopVoice={voice.onStop}
        onCancelVoice={voice.onCancel}
        onRetryVoice={voice.onRetry}
      />
      {onStop && (
        <button
          type="button"
          className="chat-stop-button"
          onClick={onStop}
          disabled={stopping}
          aria-label={stopping ? 'Deteniendo respuesta' : 'Detener respuesta'}
        >
          {stopping ? <span aria-hidden="true" className="spinner" /> : <Square size={13} />}
          <span className="sr-only">{stopping ? 'Deteniendo…' : 'Detener'}</span>
        </button>
      )}
      <button
        type="button"
        className={`chat-send-button active:brightness-90 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none${!value.trim() ? ' is-disabled' : ''}`}
        onClick={onSubmit}
        disabled={!value.trim() || submitDisabled || voiceInFlight}
        aria-label={busy ? 'Poner mensaje en cola' : 'Enviar mensaje'}
        title={busy ? 'Agregar a cola' : 'Enviar'}
      >
        {voice.state === 'stopping' || voice.state === 'transcribing' ? (
          <span aria-hidden="true" className="spinner" />
        ) : busy ? (
          <ListPlus aria-hidden="true" size={16} strokeWidth={1.8} />
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="8" y1="14" x2="8" y2="3" />
            <polyline points="3,8 8,3 13,8" />
          </svg>
        )}
      </button>
    </ComposerShell>
  );
}

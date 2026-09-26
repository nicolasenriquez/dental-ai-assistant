import { Plus, Square } from 'lucide-react';
import { type KeyboardEvent, type RefObject, useState } from 'react';
import { useAutosizeTextarea } from '../../hooks/useAutosizeTextarea';
import { type VoiceState, isVoiceInFlight } from '../../hooks/useVoiceDictation';
import type { ClinicalPatient, ComposerContextItem } from '../../lib/api';
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
  textareaRef: RefObject<HTMLTextAreaElement>;
  onChange: (value: string) => void;
  onSubmit: () => void;
  primaryAction: 'send' | 'stop' | 'stopping';
  onPrimaryAction: () => void;
  queueAvailable?: boolean;
  onQueue?: () => void;
  patientStatusOpen?: boolean;
  onTogglePatientStatus?: () => void;
  onOpenDrive?: () => void;
  contextItems?: ComposerContextItem[];
  onRemoveContext?: (id: string) => void;
  voice: ClinicalVoiceControls;
  submitDisabled?: boolean;
}

export function ClinicalComposer({
  patient,
  value,
  textareaRef,
  onChange,
  onSubmit,
  primaryAction,
  onPrimaryAction,
  queueAvailable = false,
  onQueue,
  patientStatusOpen = false,
  onTogglePatientStatus,
  onOpenDrive,
  contextItems = [],
  onRemoveContext,
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
      className={`clinical-composer${voiceStatusLayout ? ' is-voice-active' : ''}`}
      focused={focused}
      testId="clinical-composer"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && voiceInFlight) {
          event.preventDefault();
          voice.onCancel();
        }
      }}
    >
      {contextItems.length > 0 && (
        <div className="col-span-full flex w-full flex-wrap gap-2" aria-label="Contexto adjunto">
          {contextItems.map((item) => (
            <span
              key={item.id}
              className="inline-flex max-w-full items-center gap-2 rounded-md bg-surface-raised px-2 py-1 text-xs text-muted"
            >
              <span className="truncate">{item.sourceName} · selección</span>
              <button
                type="button"
                aria-label={`Quitar ${item.sourceName}`}
                onClick={() => onRemoveContext?.(item.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
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
        placeholder={patient ? 'Escribe o dicta una indicación clínica…' : 'Escribe un mensaje…'}
        className="chat-composer-input clinical-composer-input"
        aria-busy={voice.state === 'transcribing'}
      />
      <div className="clinical-composer-toolbar">
        <div className="clinical-composer-tools">
          {onOpenDrive && (
            <button
              type="button"
              className="clinical-composer-tool"
              onClick={onOpenDrive}
              aria-label="Añadir contexto desde Drive"
              title="Abrir Google Drive"
            >
              <Plus aria-hidden="true" size={17} />
            </button>
          )}
          {onTogglePatientStatus && (
            <button
              type="button"
              className="clinical-composer-tool"
              onClick={onTogglePatientStatus}
              aria-expanded={patient ? patientStatusOpen : undefined}
              aria-controls={patient ? 'patient-status-panel' : undefined}
            >
              Contexto
            </button>
          )}
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
        </div>
        <div className="clinical-composer-actions">
          {queueAvailable && value.trim() && (
            <button
              type="button"
              className="clinical-queue-button"
              onClick={onQueue}
              disabled={submitDisabled || voiceInFlight}
            >
              Encolar
            </button>
          )}
          <button
            type="button"
            className={`${primaryAction === 'send' ? 'chat-send-button' : 'chat-stop-button'} active:brightness-90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none${primaryAction === 'send' && !value.trim() ? ' is-disabled' : ''}`}
            onClick={onPrimaryAction}
            disabled={
              primaryAction === 'stopping' ||
              (primaryAction === 'send' && (!value.trim() || submitDisabled || voiceInFlight))
            }
            aria-label={
              primaryAction === 'send'
                ? 'Enviar mensaje'
                : primaryAction === 'stop'
                  ? 'Detener respuesta'
                  : 'Deteniendo respuesta'
            }
            title={primaryAction === 'send' ? 'Enviar' : 'Detener respuesta'}
          >
            {primaryAction === 'stopping' ||
            (primaryAction === 'send' &&
              (voice.state === 'stopping' || voice.state === 'transcribing')) ? (
              <span aria-hidden="true" className="spinner" />
            ) : primaryAction === 'stop' ? (
              <Square aria-hidden="true" size={14} fill="currentColor" />
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
        </div>
      </div>
    </ComposerShell>
  );
}

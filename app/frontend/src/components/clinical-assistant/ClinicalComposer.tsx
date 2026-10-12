import { Square } from 'lucide-react';
import { type KeyboardEvent, type RefObject, useState } from 'react';
import { useAutosizeTextarea } from '../../hooks/useAutosizeTextarea';
import { type VoiceState, isVoiceInFlight } from '../../hooks/useVoiceDictation';
import type { ComposerContextItem } from '../../lib/api';
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

/**
 * Presentation of the context the composer is displaying. It is deliberately
 * separate from the active workspace patient used for dispatch: a retained
 * origin can differ from the patient that would receive a send.
 */
export interface ClinicalComposerOrigin {
  /** Authorized label of the displayed origin; `null` means explicitly general. */
  label: string | null;
  /** The displayed origin differs from the active workspace patient and cannot dispatch. */
  retained: boolean;
}

interface ClinicalComposerProps {
  origin: ClinicalComposerOrigin;
  value: string;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onChange: (value: string) => void;
  onSubmit: () => void;
  primaryAction: 'send' | 'stop' | 'stopping';
  onPrimaryAction: () => void;
  queueAvailable?: boolean;
  onQueue?: () => void;
  contextItems?: ComposerContextItem[];
  onRemoveContext?: (id: string) => void;
  voice: ClinicalVoiceControls;
  submitDisabled?: boolean;
}

export function ClinicalComposer({
  origin,
  value,
  textareaRef,
  onChange,
  onSubmit,
  primaryAction,
  onPrimaryAction,
  queueAvailable = false,
  onQueue,
  contextItems = [],
  onRemoveContext,
  voice,
  submitDisabled = false,
}: ClinicalComposerProps) {
  const [focused, setFocused] = useState(false);
  const voiceInFlight = isVoiceInFlight(voice.state);
  const voiceStatusLayout = voice.state !== 'idle' && voice.state !== 'success';
  const generalOrigin = origin.label === null;
  const originName = origin.label ?? '';
  const accessibleName = origin.retained
    ? generalOrigin
      ? 'Borrador sin paciente'
      : `Borrador para ${originName}`
    : generalOrigin
      ? 'Consulta al asistente'
      : 'Nota clínica';
  const placeholder = origin.retained
    ? generalOrigin
      ? 'Continúa el borrador sin paciente…'
      : `Continúa el borrador para ${originName}…`
    : generalOrigin
      ? 'Escribe una consulta general…'
      : 'Escribe o dicta la nota clínica…';
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
      {origin.retained && (
        <p className="w-full text-xs text-muted">
          {generalOrigin ? 'Borrador sin paciente.' : `Borrador para ${originName}.`} Vuelve a este
          contexto para enviar.
        </p>
      )}
      {contextItems.length > 0 && (
        <div className="flex w-full flex-wrap gap-2" role="group" aria-label="Documentos adjuntos">
          {contextItems.map((item) => (
            <span
              key={item.id}
              className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-md bg-surface-raised px-2 py-1 text-xs text-muted"
            >
              <span className="min-w-0 break-words">{item.sourceName} · Google Drive</span>
              <button
                type="button"
                className="shrink-0"
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
        aria-label={accessibleName}
        aria-describedby="clinical-composer-keys"
        placeholder={placeholder}
        className="chat-composer-input clinical-composer-input"
        aria-busy={voice.state === 'transcribing'}
      />
      <div className="clinical-composer-toolbar">
        <p id="clinical-composer-keys" className="clinical-composer-keys">
          Enter envía · Shift+Enter agrega una línea
        </p>
        <div className="clinical-composer-tools">
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
          {queueAvailable && value.trim() && !voiceInFlight && (
            <button
              type="button"
              className="clinical-queue-button"
              onClick={onQueue}
              disabled={submitDisabled || voiceInFlight}
            >
              Encolar
            </button>
          )}
          {(!voiceInFlight || primaryAction !== 'send') && (
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
                    ? 'Detener respuesta actual'
                    : 'Deteniendo respuesta'
              }
              title={primaryAction === 'send' ? 'Enviar' : 'Detener respuesta actual'}
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
          )}
        </div>
      </div>
    </ComposerShell>
  );
}

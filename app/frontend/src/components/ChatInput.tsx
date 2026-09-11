import { ListPlus } from 'lucide-react';
import {
  type ChangeEvent,
  type KeyboardEvent,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useAutosizeTextarea } from '../hooks/useAutosizeTextarea';
import type { ChatRunState } from '../hooks/useStreamingResponse';
import { type VoiceState, isVoiceInFlight } from '../hooks/useVoiceDictation';
import { ComposerShell } from './ComposerShell';
import { Spinner } from './Spinner';
import { VoiceDictationStatus } from './voice/VoiceDictationStatus';

export interface ChatInputHandle {
  /** Restore text to the input (e.g. after a failed send) and focus */
  setInputText: (text: string) => void;
  focus: () => void;
  getTextarea: () => HTMLTextAreaElement | null;
}

interface ChatInputProps {
  onSend: (content: string) => boolean | undefined;
  value?: string;
  onValueChange?: (value: string) => void;
  isStreaming?: boolean;
  runState?: ChatRunState;
  disabled?: boolean;
  onStop?: () => void;
  voiceState?: VoiceState;
  voiceElapsed?: number;
  voiceError?: string | null;
  voiceCanRetry?: boolean;
  voiceStream?: MediaStream | null;
  onVoice?: () => void;
  onStopVoice?: () => void;
  onCancelVoice?: () => void;
  onRetryVoice?: () => void;
  submitDisabled?: boolean;
}

const ACTIVE_RUN_STATES: ChatRunState[] = [
  'submitting',
  'waiting_first_token',
  'streaming',
  'stopping',
];

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  (
    {
      onSend,
      value,
      onValueChange,
      isStreaming = false,
      runState,
      disabled = false,
      onStop,
      voiceState,
      voiceElapsed = 0,
      voiceError = null,
      voiceCanRetry = false,
      voiceStream = null,
      onVoice,
      onStopVoice,
      onCancelVoice,
      onRetryVoice,
      submitDisabled = false,
    },
    ref,
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [fallbackValue, setFallbackValue] = useState('');
    const [focused, setFocused] = useState(false);

    const isControlled = value !== undefined;
    const inputValue = isControlled ? value : fallbackValue;
    const activeRun = runState ? ACTIVE_RUN_STATES.includes(runState) : isStreaming;
    const isStopping = runState === 'stopping';
    const isDisabled = disabled;
    const voiceInFlight = voiceState ? isVoiceInFlight(voiceState) : false;
    const isSubmitDisabled = isDisabled || submitDisabled || voiceInFlight;

    useAutosizeTextarea({ ref: textareaRef, value: inputValue });

    const setValue = useCallback(
      (nextValue: string) => {
        if (!isControlled) setFallbackValue(nextValue);
        onValueChange?.(nextValue);
      },
      [isControlled, onValueChange],
    );

    useImperativeHandle(
      ref,
      () => ({
        setInputText: (text: string) => {
          setValue(text);
          textareaRef.current?.focus();
        },
        focus: () => textareaRef.current?.focus(),
        getTextarea: () => textareaRef.current,
      }),
      [setValue],
    );

    const handleSend = useCallback(() => {
      const content = inputValue.trim();
      if (!content || isSubmitDisabled) return;

      const accepted = onSend(content);
      if (accepted !== false) {
        setValue('');
      }
    }, [inputValue, isSubmitDisabled, onSend, setValue]);

    const handleChange = useCallback(
      (event: ChangeEvent<HTMLTextAreaElement>) => {
        setValue(event.target.value);
      },
      [setValue],
    );

    const handleKeyDown = useCallback(
      (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Escape' && voiceInFlight) {
          event.preventDefault();
          onCancelVoice?.();
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          if (event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (isSubmitDisabled) return;
          handleSend();
        }
      },
      [handleSend, isSubmitDisabled, onCancelVoice, voiceInFlight],
    );

    return (
      <ComposerShell
        className={voiceInFlight ? 'chat-composer--voice-active' : ''}
        focused={focused}
        disabled={isDisabled}
      >
        <textarea
          ref={textareaRef}
          aria-label="Pregunta sobre la biblioteca de videos"
          placeholder={
            activeRun
              ? 'Escribe un mensaje para enviarlo después…'
              : 'Pregunta sobre la biblioteca de videos…'
          }
          value={inputValue}
          disabled={isDisabled}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={1}
          className="chat-composer-input"
          aria-busy={voiceState === 'transcribing'}
        />

        {voiceState && (
          <VoiceDictationStatus
            voiceState={voiceState}
            voiceElapsed={voiceElapsed}
            voiceError={voiceError}
            canRetry={voiceCanRetry}
            stream={voiceStream}
            onStartVoice={onVoice}
            onStopVoice={onStopVoice ?? (() => {})}
            onCancelVoice={onCancelVoice ?? (() => {})}
            onRetryVoice={onRetryVoice ?? (() => {})}
          />
        )}

        {activeRun && (
          <button
            type="button"
            onClick={onStop}
            disabled={isStopping || isDisabled}
            aria-label={isStopping ? 'Deteniendo respuesta' : 'Detener respuesta'}
            title={isStopping ? 'Deteniendo…' : 'Detener'}
            className="chat-stop-button active:brightness-90 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          >
            {isStopping ? (
              <Spinner size={13} />
            ) : (
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="1" y="1" width="10" height="10" rx="1" />
              </svg>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={handleSend}
          disabled={isSubmitDisabled || !inputValue.trim()}
          aria-label={activeRun ? 'Poner mensaje en cola' : 'Enviar mensaje'}
          title={activeRun ? 'Agregar a cola' : 'Enviar'}
          className={`chat-send-button${!inputValue.trim() || isSubmitDisabled ? ' is-disabled' : ''} active:brightness-90 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none`}
        >
          {activeRun ? (
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
  },
);

ChatInput.displayName = 'ChatInput';

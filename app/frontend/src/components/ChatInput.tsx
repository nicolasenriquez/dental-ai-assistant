import {
  type ChangeEvent,
  type KeyboardEvent,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { ChatRunState } from '../hooks/useStreamingResponse';

export interface ChatInputHandle {
  /** Restore text to the input (e.g. after a failed send) and focus */
  setInputText: (text: string) => void;
  focus: () => void;
}

interface ChatInputProps {
  onSend: (content: string) => boolean | undefined;
  value?: string;
  onValueChange?: (value: string) => void;
  isStreaming?: boolean;
  runState?: ChatRunState;
  disabled?: boolean;
  onStop?: () => void;
}

const ACTIVE_RUN_STATES: ChatRunState[] = [
  'submitting',
  'waiting_first_token',
  'streaming',
  'stopping',
];

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  (
    { onSend, value, onValueChange, isStreaming = false, runState, disabled = false, onStop },
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

    const setValue = useCallback(
      (nextValue: string) => {
        if (!isControlled) setFallbackValue(nextValue);
        onValueChange?.(nextValue);
      },
      [isControlled, onValueChange],
    );

    const adjustHeight = useCallback(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      const maxHeight = 144;
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
      el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }, []);

    useLayoutEffect(() => {
      adjustHeight();
    }, [adjustHeight, inputValue]);

    useImperativeHandle(
      ref,
      () => ({
        setInputText: (text: string) => {
          setValue(text);
          setTimeout(adjustHeight, 0);
          textareaRef.current?.focus();
        },
        focus: () => textareaRef.current?.focus(),
      }),
      [adjustHeight, setValue],
    );

    const handleSend = useCallback(() => {
      const content = inputValue.trim();
      if (!content || isDisabled) return;

      const accepted = onSend(content);
      if (accepted !== false) {
        setValue('');
        const el = textareaRef.current;
        if (el) {
          el.style.height = 'auto';
          el.style.overflowY = 'hidden';
        }
      }
    }, [inputValue, isDisabled, onSend, setValue]);

    const handleChange = useCallback(
      (event: ChangeEvent<HTMLTextAreaElement>) => {
        setValue(event.target.value);
      },
      [setValue],
    );

    const handleKeyDown = useCallback(
      (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          handleSend();
        }
      },
      [handleSend],
    );

    return (
      <div
        className="chat-composer"
        style={{
          background: '#111827',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          opacity: isDisabled ? 0.7 : 1,
          transition: 'opacity 0.2s, box-shadow 0.15s',
          boxShadow: focused && !isDisabled ? '0 0 0 2px var(--accent-glow)' : 'none',
        }}
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
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: isDisabled ? 'var(--text-tertiary)' : '#f1f5f9',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontSize: 15,
            lineHeight: '24px',
            padding: 0,
            resize: 'none',
            outline: 'none',
            overflowY: 'hidden',
            minHeight: 24,
            maxHeight: 144,
            cursor: isDisabled ? 'not-allowed' : 'text',
          }}
        />

        {activeRun && (
          <button
            type="button"
            onClick={onStop}
            disabled={isStopping || isDisabled}
            aria-label="Detener respuesta"
            className="active:brightness-90 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
            style={{
              background: '#dc2626',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              cursor: isStopping || isDisabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              height: 44,
              width: 44,
              opacity: isStopping ? 0.55 : 1,
              transition: 'background 0.15s, filter 0.15s, opacity 0.15s',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <rect x="1" y="1" width="10" height="10" rx="1" />
            </svg>
          </button>
        )}

        <button
          type="button"
          onClick={handleSend}
          disabled={isDisabled || !inputValue.trim()}
          aria-label={activeRun ? 'Poner mensaje en cola' : 'Enviar mensaje'}
          className="active:brightness-90 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          style={{
            background: isDisabled || !inputValue.trim() ? '#1e293b' : '#3b82f6',
            border: 'none',
            borderRadius: 8,
            color: isDisabled || !inputValue.trim() ? 'var(--text-tertiary)' : '#fff',
            cursor: isDisabled || !inputValue.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            height: 44,
            width: 44,
            transition: 'background 0.15s, color 0.15s, filter 0.15s',
          }}
        >
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
        </button>
      </div>
    );
  },
);

ChatInput.displayName = 'ChatInput';

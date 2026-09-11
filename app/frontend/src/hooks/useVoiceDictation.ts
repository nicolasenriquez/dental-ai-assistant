import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, transcribeAudio } from '../lib/api';

export type VoiceState =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'stopping'
  | 'transcribing'
  | 'success'
  | 'cancelled'
  | 'error';

const MAX_DURATION_MS = 120_000;
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
const EMPTY_AUDIO_MESSAGE = 'No encontramos audio válido en la grabación. Intenta nuevamente.';

function voiceErrorCode(error: ApiError): string | undefined {
  const body = error.body;
  const detail =
    body && typeof body === 'object' && 'detail' in body
      ? (body as { detail?: unknown }).detail
      : body;
  const code =
    detail && typeof detail === 'object' && 'code' in detail
      ? (detail as { code?: unknown }).code
      : undefined;
  return typeof code === 'string' ? code : undefined;
}

export function isVoiceInFlight(state: VoiceState): boolean {
  return (
    state === 'requesting_permission' ||
    state === 'recording' ||
    state === 'stopping' ||
    state === 'transcribing'
  );
}

function voiceErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const code = voiceErrorCode(error);
    const messages: Record<string, string> = {
      AUDIO_TOO_LARGE: 'La grabación es demasiado larga. Prueba con una nota más breve.',
      INVALID_AUDIO: EMPTY_AUDIO_MESSAGE,
      VOICE_TRANSCRIPTION_DISABLED: 'El dictado no está disponible en este momento.',
      VOICE_RATE_LIMIT_EXCEEDED: 'Alcanzaste el límite de dictados por ahora.',
      TRANSCRIPTION_BUSY: 'El servicio de dictado está ocupado. Intenta nuevamente.',
      TRANSCRIPTION_FAILED: 'El servicio de dictado no pudo procesar la grabación.',
      TRANSCRIPTION_TIMEOUT: 'La transcripción tardó demasiado. Intenta nuevamente.',
    };
    if (typeof code === 'string' && messages[code]) return messages[code];
    if (error.status === 408 || error.status === 504) {
      return 'La transcripción tardó demasiado. Intenta nuevamente.';
    }
    if (error.status >= 500) return 'El servicio de dictado no pudo procesar la grabación.';
    return 'No pudimos transcribir esta grabación.';
  }
  if (error instanceof TypeError) return 'No pudimos conectar con el servicio de dictado.';
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return 'La transcripción tardó demasiado. Intenta nuevamente.';
  }
  return 'No pudimos transcribir esta grabación.';
}

function isRetryableVoiceError(error: unknown): boolean {
  if (error instanceof ApiError) {
    const code = voiceErrorCode(error);
    if (code) {
      return ['TRANSCRIPTION_BUSY', 'TRANSCRIPTION_FAILED', 'TRANSCRIPTION_TIMEOUT'].includes(code);
    }
    return error.status === 408 || error.status >= 500;
  }
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException) return error.name === 'TimeoutError';
  return true;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function useVoiceDictation(scopeId: string, onText: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const mountedRef = useRef(false);
  const stateRef = useRef<VoiceState>('idle');
  const scopeRef = useRef(scopeId);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const cancelledRef = useRef(false);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const onTextRef = useRef(onText);
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const operationRef = useRef(0);
  scopeRef.current = scopeId;
  onTextRef.current = onText;

  const updateState = useCallback((nextState: VoiceState) => {
    stateRef.current = nextState;
    if (mountedRef.current) setState(nextState);
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    timerRef.current = null;
    stopTimerRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    clearTimers();
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (mountedRef.current) setStream(null);
    recorderRef.current = null;
  }, [clearTimers]);

  // Invalidate every async callback before releasing its media resources.
  const invalidate = useCallback(() => {
    operationRef.current += 1;
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = null;
    cancelledRef.current = true;
    clearTimers();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    chunksRef.current = [];
    blobRef.current = null;
    cleanup();
  }, [cleanup, clearTimers]);

  const isCurrentOperation = useCallback(
    (operation: number, sourceScope: string) =>
      mountedRef.current && operation === operationRef.current && sourceScope === scopeRef.current,
    [],
  );

  const transcribe = useCallback(
    async (blob: Blob, operation = operationRef.current) => {
      const sourceScope = scopeId;
      const controller = new AbortController();
      transcriptionAbortRef.current = controller;
      updateState('transcribing');
      if (mountedRef.current) {
        setError(null);
        setRetryable(false);
      }
      try {
        const result = await transcribeAudio(blob, controller.signal);
        if (!isCurrentOperation(operation, sourceScope)) return;
        const text = result.text.trim();
        if (!text) throw new Error('empty transcription');
        onTextRef.current(text);
        if (!isCurrentOperation(operation, sourceScope)) return;
        updateState('success');
        setRetryable(false);
      } catch (caught) {
        if (isAbortError(caught)) return;
        if (!isCurrentOperation(operation, sourceScope)) return;
        setError(voiceErrorMessage(caught));
        setRetryable(isRetryableVoiceError(caught));
        updateState('error');
      } finally {
        if (transcriptionAbortRef.current === controller) transcriptionAbortRef.current = null;
      }
    },
    [isCurrentOperation, scopeId, updateState],
  );

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      updateState('stopping');
      recorderRef.current.stop();
    }
  }, [updateState]);

  const cancel = useCallback(() => {
    invalidate();
    if (!mountedRef.current) return;
    setError(null);
    setRetryable(false);
    updateState('idle');
  }, [invalidate, updateState]);

  const canRetry = state === 'error' && retryable && blobRef.current !== null;

  const retry = useCallback(() => {
    if (!canRetry || isVoiceInFlight(stateRef.current) || !blobRef.current) return;
    void transcribe(blobRef.current, operationRef.current);
  }, [canRetry, transcribe]);

  const start = useCallback(async () => {
    if (isVoiceInFlight(stateRef.current)) return;
    if (mountedRef.current) {
      setError(null);
      setRetryable(false);
    }
    cancelledRef.current = false;
    blobRef.current = null;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      updateState('error');
      if (mountedRef.current) {
        setError('Este navegador no permite grabar audio.');
        setRetryable(false);
      }
      return;
    }

    const operation = ++operationRef.current;
    const sourceScope = scopeId;
    updateState('requesting_permission');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isCurrentOperation(operation, sourceScope)) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      streamRef.current = stream;
      setStream(stream);
      const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (isCurrentOperation(operation, sourceScope) && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        });
        cleanup();
        if (!isCurrentOperation(operation, sourceScope) || cancelledRef.current) return;
        if (blob.size === 0) {
          blobRef.current = null;
          updateState('error');
          setError(EMPTY_AUDIO_MESSAGE);
          setRetryable(false);
          return;
        }
        blobRef.current = blob;
        void transcribe(blob, operation);
      };
      startedAtRef.current = Date.now();
      if (mountedRef.current) setElapsed(0);
      updateState('recording');
      timerRef.current = window.setInterval(() => {
        if (mountedRef.current && isCurrentOperation(operation, sourceScope)) {
          setElapsed(Date.now() - startedAtRef.current);
        }
      }, 250);
      stopTimerRef.current = window.setTimeout(stop, MAX_DURATION_MS);
      recorder.start();
    } catch (caught) {
      cleanup();
      if (!isCurrentOperation(operation, sourceScope)) return;
      updateState('error');
      setError(
        caught instanceof DOMException && caught.name === 'NotAllowedError'
          ? 'El navegador no permitió usar el micrófono.'
          : 'No pude iniciar la grabación.',
      );
      setRetryable(false);
    }
  }, [cleanup, isCurrentOperation, scopeId, stop, transcribe, updateState]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      invalidate();
    };
  }, [invalidate]);

  useEffect(() => {
    invalidate();
    if (!mountedRef.current) return;
    setElapsed(0);
    setError(null);
    setRetryable(false);
    updateState('idle');
  }, [invalidate, scopeId, updateState]);

  useEffect(() => {
    if (state !== 'success') return;
    const timeout = window.setTimeout(() => updateState('idle'), 900);
    return () => window.clearTimeout(timeout);
  }, [state, updateState]);

  return { state, elapsed, error, canRetry, stream, start, stop, cancel, retry };
}

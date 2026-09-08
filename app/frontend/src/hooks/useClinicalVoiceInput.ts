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

function voiceErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body;
    const detail = body && typeof body === 'object' && 'detail' in body
      ? (body as { detail?: unknown }).detail
      : body;
    const code = detail && typeof detail === 'object' && 'code' in detail
      ? (detail as { code?: unknown }).code
      : undefined;
    const messages: Record<string, string> = {
      AUDIO_TOO_LARGE: 'La grabación es demasiado larga. Prueba con una nota más breve.',
      INVALID_AUDIO: 'No encontramos audio válido en la grabación. Intenta nuevamente.',
      VOICE_TRANSCRIPTION_DISABLED: 'El dictado no está disponible en este momento.',
      VOICE_RATE_LIMIT_EXCEEDED: 'Alcanzaste el límite de dictados por ahora.',
      TRANSCRIPTION_FAILED: 'El servicio de dictado no pudo procesar la grabación.',
    };
    if (typeof code === 'string' && messages[code]) return messages[code];
    if (error.status >= 500) return 'El servicio de dictado no pudo procesar la grabación.';
    return 'No pudimos transcribir esta grabación.';
  }
  if (error instanceof TypeError) return 'No pudimos conectar con el servicio de dictado.';
  return 'No pudimos transcribir esta grabación.';
}

export function useClinicalVoiceInput(onText: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const cancelledRef = useRef(false);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    timerRef.current = null;
    stopTimerRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    clearTimers();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, [clearTimers]);

  const transcribe = useCallback(async (blob: Blob) => {
    setState('transcribing');
    setError(null);
    try {
      const result = await transcribeAudio(blob);
      if (!result.text.trim()) throw new Error('empty transcription');
      onTextRef.current(result.text.trim());
      setState('success');
    } catch (caught) {
      setState('error');
      setError(voiceErrorMessage(caught));
    }
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      setState('stopping');
      recorderRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    clearTimers();
    chunksRef.current = [];
    blobRef.current = null;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    cleanup();
    setError(null);
    setState('cancelled');
  }, [cleanup, clearTimers]);

  const retry = useCallback(() => {
    if (blobRef.current) void transcribe(blobRef.current);
  }, [transcribe]);

  const start = useCallback(async () => {
    if (state === 'requesting_permission' || state === 'recording' || state === 'stopping' || state === 'transcribing') return;
    setError(null);
    cancelledRef.current = false;
    blobRef.current = null;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState('error');
      setError('Este navegador no permite grabar audio.');
      return;
    }
    setState('requesting_permission');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        cleanup();
        if (cancelledRef.current) {
          setState('cancelled');
          return;
        }
        blobRef.current = blob;
        void transcribe(blob);
      };
      startedAtRef.current = Date.now();
      setElapsed(0);
      setState('recording');
      timerRef.current = window.setInterval(() => setElapsed(Date.now() - startedAtRef.current), 250);
      stopTimerRef.current = window.setTimeout(stop, MAX_DURATION_MS);
      recorder.start();
    } catch (caught) {
      cleanup();
      setState('error');
      setError(caught instanceof DOMException && caught.name === 'NotAllowedError'
        ? 'El navegador no permitió usar el micrófono.'
        : 'No pude iniciar la grabación.');
    }
  }, [cleanup, state, stop]);

  useEffect(() => cleanup, [cleanup]);

  return { state, elapsed, error, start, stop, cancel, retry };
}

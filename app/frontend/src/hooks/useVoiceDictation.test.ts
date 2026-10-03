import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, transcribeAudio } from '../lib/api';
import { isVoiceInFlight, useVoiceDictation } from './useVoiceDictation';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, transcribeAudio: vi.fn() };
});

class FakeRecorder {
  static isTypeSupported() {
    return true;
  }
  static last: FakeRecorder | null = null;
  state: RecordingState = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    FakeRecorder.last = this;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

function installRecorder() {
  const track = { stop: vi.fn(), onended: null as (() => void) | null };
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: FakeRecorder });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) },
  });
  return track;
}

describe('useVoiceDictation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeRecorder.last = null;
    installRecorder();
  });

  it('identifies only active voice operations as in flight', () => {
    expect(isVoiceInFlight('requesting_permission')).toBe(true);
    expect(isVoiceInFlight('recording')).toBe(true);
    expect(isVoiceInFlight('stopping')).toBe(true);
    expect(isVoiceInFlight('transcribing')).toBe(true);
    expect(isVoiceInFlight('idle')).toBe(false);
    expect(isVoiceInFlight('success')).toBe(false);
    expect(isVoiceInFlight('error')).toBe(false);
  });

  it('drops a late transcription after scope changes', async () => {
    let resolveTranscription!: (value: { text: string }) => void;
    vi.mocked(transcribeAudio).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTranscription = resolve;
      }),
    );
    const onText = vi.fn();
    const { result, rerender } = renderHook(({ scopeId }) => useVoiceDictation(scopeId, onText), {
      initialProps: { scopeId: 'thread-a' },
    });

    await act(async () => {
      await result.current.start();
    });
    const recorder = FakeRecorder.last;
    expect(recorder).not.toBeNull();
    recorder?.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) } as BlobEvent);
    act(() => recorder?.stop());
    await waitFor(() => expect(transcribeAudio).toHaveBeenCalledTimes(1));

    rerender({ scopeId: 'thread-b' });
    resolveTranscription({ text: 'resultado tardío' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(onText).not.toHaveBeenCalled();
  });

  it('drops a late transcription after cancellation', async () => {
    let resolveTranscription!: (value: { text: string }) => void;
    vi.mocked(transcribeAudio).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTranscription = resolve;
      }),
    );
    const onText = vi.fn();
    const { result } = renderHook(() => useVoiceDictation('thread-a', onText));

    await act(async () => {
      await result.current.start();
    });
    const recorder = FakeRecorder.last;
    recorder?.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) } as BlobEvent);
    act(() => recorder?.stop());
    await waitFor(() => expect(transcribeAudio).toHaveBeenCalledTimes(1));

    act(() => result.current.cancel());
    resolveTranscription({ text: 'resultado cancelado' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state).toBe('idle');
    expect(onText).not.toHaveBeenCalled();
  });

  it('guards empty recordings before transcription and retry', async () => {
    const onText = vi.fn();
    const { result } = renderHook(() => useVoiceDictation('thread-a', onText));

    await act(async () => {
      await result.current.start();
    });
    act(() => FakeRecorder.last?.stop());

    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.error).toBe(
      'No encontramos audio válido en la grabación. Intenta nuevamente.',
    );
    expect(result.current.canRetry).toBe(false);
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it('returns an explicit error when the microphone track ends', async () => {
    const track = installRecorder();
    const { result } = renderHook(() => useVoiceDictation('thread-a', vi.fn()));
    await act(async () => result.current.start());
    act(() => track.onended?.());
    expect(result.current.state).toBe('error');
    expect(result.current.error).toContain('micrófono se desconectó');
  });

  it('retries the same Blob within one scope', async () => {
    vi.mocked(transcribeAudio)
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ text: 'dictado recuperado' });
    const onText = vi.fn();
    const { result } = renderHook(() => useVoiceDictation('thread-a', onText));

    await act(async () => {
      await result.current.start();
    });
    const recorder = FakeRecorder.last;
    recorder?.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) } as BlobEvent);
    act(() => recorder?.stop());
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.canRetry).toBe(true);
    const firstBlob = vi.mocked(transcribeAudio).mock.calls[0]?.[0];
    act(() => result.current.retry());
    await waitFor(() => expect(onText).toHaveBeenCalledWith('dictado recuperado'));
    expect(vi.mocked(transcribeAudio).mock.calls[1]?.[0]).toBe(firstBlob);
  });

  it('maps busy and timeout failures to retryable Spanish messages', async () => {
    vi.mocked(transcribeAudio)
      .mockRejectedValueOnce(new ApiError(503, { detail: { code: 'TRANSCRIPTION_BUSY' } }))
      .mockRejectedValueOnce(new ApiError(504, { detail: { code: 'TRANSCRIPTION_TIMEOUT' } }));
    const { result } = renderHook(() => useVoiceDictation('thread-a', vi.fn()));

    await act(async () => {
      await result.current.start();
    });
    let recorder = FakeRecorder.last;
    recorder?.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) } as BlobEvent);
    act(() => recorder?.stop());
    await waitFor(() =>
      expect(result.current.error).toBe('El servicio de dictado está ocupado. Intenta nuevamente.'),
    );
    expect(result.current.canRetry).toBe(true);

    act(() => result.current.cancel());
    await act(async () => {
      await result.current.start();
    });
    recorder = FakeRecorder.last;
    recorder?.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) } as BlobEvent);
    act(() => recorder?.stop());
    await waitFor(() =>
      expect(result.current.error).toBe('La transcripción tardó demasiado. Intenta nuevamente.'),
    );
    expect(result.current.canRetry).toBe(true);
  });

  it('does not offer retry for permanent audio errors', async () => {
    vi.mocked(transcribeAudio).mockRejectedValueOnce(
      new ApiError(413, { detail: { code: 'AUDIO_TOO_LARGE' } }),
    );
    const { result } = renderHook(() => useVoiceDictation('thread-a', vi.fn()));

    await act(async () => {
      await result.current.start();
    });
    const recorder = FakeRecorder.last;
    recorder?.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) } as BlobEvent);
    act(() => recorder?.stop());
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.canRetry).toBe(false);
  });

  it('invalidates pending work on unmount without updating state', async () => {
    let resolvePermission!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolvePermission = resolve;
        }),
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useVoiceDictation('thread-a', vi.fn()));

    act(() => void result.current.start());
    unmount();
    resolvePermission({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream);
    await act(async () => {
      await Promise.resolve();
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

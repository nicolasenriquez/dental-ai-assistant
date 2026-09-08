import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transcribeAudio } from '../lib/api';
import { useClinicalVoiceInput } from './useClinicalVoiceInput';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, transcribeAudio: vi.fn() };
});

class FakeRecorder {
  static isTypeSupported() { return true; }
  static last: FakeRecorder | null = null;
  state: RecordingState = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() { FakeRecorder.last = this; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.onstop?.(); }
}

function installRecorder() {
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: FakeRecorder });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
  });
}

describe('useClinicalVoiceInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeRecorder.last = null;
    installRecorder();
  });

  it('drops a late transcription after the recording scope changes', async () => {
    let resolveTranscription!: (value: { text: string }) => void;
    vi.mocked(transcribeAudio).mockReturnValueOnce(new Promise((resolve) => { resolveTranscription = resolve; }));
    const onText = vi.fn();
    const { result, rerender } = renderHook(
      ({ scopeId }) => useClinicalVoiceInput(scopeId, onText),
      { initialProps: { scopeId: 'thread-a' } },
    );

    await act(async () => { await result.current.start(); });
    const recorder = FakeRecorder.last;
    expect(recorder).not.toBeNull();
    recorder?.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) } as BlobEvent);
    act(() => recorder?.stop());
    await waitFor(() => expect(transcribeAudio).toHaveBeenCalledTimes(1));

    rerender({ scopeId: 'thread-b' });
    resolveTranscription({ text: 'resultado tardío' });
    await act(async () => { await Promise.resolve(); });
    expect(onText).not.toHaveBeenCalled();
  });

  it('retries the same Blob within one scope', async () => {
    vi.mocked(transcribeAudio)
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ text: 'dictado recuperado' });
    const onText = vi.fn();
    const { result } = renderHook(() => useClinicalVoiceInput('thread-a', onText));

    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe('recording');
    const recorder = FakeRecorder.last;
    recorder?.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) } as BlobEvent);
    act(() => recorder?.stop());
    await waitFor(() => expect(result.current.state).toBe('error'));
    const firstBlob = vi.mocked(transcribeAudio).mock.calls[0]?.[0];
    act(() => result.current.retry());
    await waitFor(() => expect(onText).toHaveBeenCalledWith('dictado recuperado'));
    expect(vi.mocked(transcribeAudio).mock.calls[1]?.[0]).toBe(firstBlob);
  });
});

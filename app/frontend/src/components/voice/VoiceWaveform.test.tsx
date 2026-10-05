import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VoiceWaveform } from './VoiceWaveform';

class FakeMediaStream {}

describe('VoiceWaveform', () => {
  it('responds to audio, settles on silence, and releases the analyser', () => {
    let fftSize = 2048;
    let drawFrame: FrameRequestCallback | undefined;
    const analyser = {
      get frequencyBinCount() {
        return fftSize / 2;
      },
      get fftSize() {
        return fftSize;
      },
      set fftSize(value: number) {
        fftSize = value;
      },
      smoothingTimeConstant: 0,
      getByteFrequencyData: vi.fn((data: Uint8Array) => {
        data.fill(0, 0, fftSize / 2);
        data[0] = 255;
        data[5] = 128;
      }),
    };
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const audioContext = {
      createAnalyser: vi.fn(() => analyser),
      createMediaStreamSource: vi.fn(() => source),
      close: vi.fn(async () => undefined),
    };
    vi.stubGlobal('MediaStream', FakeMediaStream);
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => audioContext),
    );
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        drawFrame = callback;
        return 1;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    try {
      const stream = new FakeMediaStream();
      const view = render(<VoiceWaveform stream={stream as MediaStream} />);

      expect(view.container.querySelectorAll('i')).toHaveLength(6);
      expect(analyser.fftSize).toBe(64);
      expect(analyser.smoothingTimeConstant).toBe(0.82);
      expect(audioContext.createMediaStreamSource).toHaveBeenCalledWith(stream);

      act(() => {
        drawFrame?.(34);
      });
      const bars = view.container.querySelectorAll('i');
      expect((bars[0] as HTMLElement).style.transform).toBe('scaleY(1)');
      expect((bars[1] as HTMLElement).style.transform).toBe('scaleY(0.5019607843137255)');

      analyser.getByteFrequencyData.mockImplementation((data) => data.fill(0));
      act(() => drawFrame?.(68));
      expect(
        Array.from(bars).every((bar) => (bar as HTMLElement).style.transform === 'scaleY(0.12)'),
      ).toBe(true);

      view.unmount();
      expect(source.disconnect).toHaveBeenCalledOnce();
      expect(audioContext.close).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

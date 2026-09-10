import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VoiceWaveform } from './VoiceWaveform';

class FakeMediaStream {}

describe('VoiceWaveform', () => {
  it('uses a calm 12-bar analyser driven by the provided stream', () => {
    const analyser = {
      frequencyBinCount: 32,
      fftSize: 0,
      smoothingTimeConstant: 0,
      getByteFrequencyData: vi.fn(),
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
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    try {
      const stream = new FakeMediaStream();
      const view = render(<VoiceWaveform stream={stream as MediaStream} />);

      expect(view.container.querySelectorAll('i')).toHaveLength(12);
      expect(analyser.fftSize).toBe(64);
      expect(analyser.smoothingTimeConstant).toBe(0.82);
      expect(audioContext.createMediaStreamSource).toHaveBeenCalledWith(stream);
      view.unmount();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

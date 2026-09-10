import { useEffect, useRef } from 'react';

interface VoiceWaveformProps {
  stream: MediaStream | null;
}

const BAR_COUNT = 12;
const FRAME_INTERVAL_MS = 1000 / 30;

export function VoiceWaveform({ stream }: VoiceWaveformProps) {
  const barsRef = useRef<HTMLSpanElement>(null);
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (
      !stream ||
      typeof MediaStream === 'undefined' ||
      !(stream instanceof MediaStream) ||
      typeof AudioContext === 'undefined' ||
      prefersReducedMotion
    )
      return;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    const source = context.createMediaStreamSource(stream);
    const samples = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    let lastDraw = 0;
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);

    const draw = (timestamp: number) => {
      if (timestamp - lastDraw >= FRAME_INTERVAL_MS) {
        analyser.getByteFrequencyData(samples);
        for (const [index, bar] of Array.from(barsRef.current?.children ?? []).entries()) {
          const level = samples[Math.floor((index / BAR_COUNT) * samples.length)] ?? 0;
          (bar as HTMLElement).style.transform = `scaleY(${Math.max(0.12, level / 255)})`;
        }
        lastDraw = timestamp;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close();
    };
  }, [prefersReducedMotion, stream]);

  return (
    <span ref={barsRef} className="voice-waveform" aria-hidden="true">
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <i key={index} />
      ))}
    </span>
  );
}

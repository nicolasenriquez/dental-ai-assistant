import { useEffect, useRef } from 'react';

interface VoiceWaveformProps {
  stream: MediaStream | null;
}

export function VoiceWaveform({ stream }: VoiceWaveformProps) {
  const barsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (
      !stream ||
      typeof MediaStream === 'undefined' ||
      !(stream instanceof MediaStream) ||
      typeof AudioContext === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    const source = context.createMediaStreamSource(stream);
    const samples = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);

    const draw = () => {
      analyser.getByteFrequencyData(samples);
      for (const [index, bar] of Array.from(barsRef.current?.children ?? []).entries()) {
        const level = samples[Math.floor((index / 20) * samples.length)] ?? 0;
        (bar as HTMLElement).style.transform = `scaleY(${Math.max(0.12, level / 255)})`;
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close();
    };
  }, [stream]);

  return (
    <span ref={barsRef} className="voice-waveform" aria-hidden="true">
      {Array.from({ length: 20 }, (_, index) => (
        <i key={index} />
      ))}
    </span>
  );
}

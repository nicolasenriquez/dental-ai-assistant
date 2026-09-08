interface VoiceInputProps {
  onStart: () => void;
  disabled?: boolean;
}

export function VoiceInput({ onStart, disabled }: VoiceInputProps) {
  return <button type="button" className="clinical-secondary-button" onClick={onStart} disabled={disabled} aria-label="Dictar nota">🎙 Dictar</button>;
}

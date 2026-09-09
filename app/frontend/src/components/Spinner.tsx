import { LoaderCircle } from 'lucide-react';

interface SpinnerProps {
  size?: number;
  className?: string;
}

export function Spinner({ size = 14, className = '' }: SpinnerProps) {
  return (
    <LoaderCircle
      aria-hidden="true"
      size={size}
      strokeWidth={1.8}
      className={`animate-spin ${className}`.trim()}
    />
  );
}

interface DentalToothIconProps {
  className?: string;
}

export function DentalToothIcon({ className }: DentalToothIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M7.2 3.5c1.7 0 2.9 1.25 4.8 1.25s3.1-1.25 4.8-1.25c2.25 0 3.7 1.85 3.7 4.2 0 1.9-1.05 3.15-1.55 4.75-.65 2.1-.25 7.85-2.65 7.85-1.75 0-2.15-4.8-4.3-4.8s-2.55 4.8-4.3 4.8c-2.4 0-2-5.75-2.65-7.85C4.55 10.85 3.5 9.6 3.5 7.7c0-2.35 1.45-4.2 3.7-4.2Z" />
    </svg>
  );
}

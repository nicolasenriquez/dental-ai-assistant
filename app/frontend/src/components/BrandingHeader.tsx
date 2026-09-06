import { DentalToothIcon } from './DentalToothIcon';

export function BrandingHeader() {
  return (
    <div className="flex flex-col items-center mb-4">
      <span
        className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#3b82f6] text-white"
        aria-hidden="true"
      >
        <DentalToothIcon className="size-6" />
      </span>
      <span className="text-xl font-semibold text-[var(--text-primary)]">Dental AI Assistant</span>
      <span className="text-sm text-[var(--text-secondary)]">
        Pregúntale cualquier cosa a la biblioteca de YouTube de Cole Medin
      </span>
    </div>
  );
}

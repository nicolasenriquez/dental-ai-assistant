import { IdCard, Mail, Phone } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export function PatientHeaderDisclosure({
  kind,
  value,
}: {
  kind: 'Teléfono' | 'Correo' | 'RUT';
  value: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const suppressFocus = useRef(false);
  const Icon = kind === 'Teléfono' ? Phone : kind === 'Correo' ? Mail : IdCard;
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent | TouchEvent): void => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('touchstart', dismiss);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('touchstart', dismiss);
    };
  }, [open]);
  return (
    <div ref={root} className="relative" onMouseLeave={() => !pinned && setOpen(false)}>
      <button
        ref={button}
        type="button"
        aria-label={`Mostrar ${kind}`}
        title={`Mostrar ${kind}`}
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={open ? id : undefined}
        className="flex h-11 w-11 items-center justify-center rounded border border-border text-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
        onMouseEnter={() => setOpen(true)}
        onFocus={() => {
          if (!suppressFocus.current) setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
          setPinned(false);
        }}
        onClick={() => {
          setOpen(!pinned);
          setPinned(!pinned);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            suppressFocus.current = true;
            button.current?.focus();
            suppressFocus.current = false;
            setOpen(false);
            setPinned(false);
          }
        }}
      >
        <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={id}
          role="tooltip"
          className="absolute left-0 top-full z-20 w-48 break-words rounded border border-border bg-surface p-3 text-sm text-foreground shadow-lg"
        >
          <strong>{kind}</strong>
          <p>{value}</p>
        </div>
      )}
    </div>
  );
}

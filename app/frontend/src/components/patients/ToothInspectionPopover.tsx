import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ToothInspectionPopoverProps {
  tooth: number;
  anchor: HTMLElement;
  onClose: () => void;
  children: ReactNode;
}

export function ToothInspectionPopover({
  tooth,
  anchor,
  onClose,
  children,
}: ToothInspectionPopoverProps): JSX.Element {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    const place = (): void => {
      const rect = anchor.getBoundingClientRect();
      const width = panel.current?.offsetWidth ?? 288;
      const height = panel.current?.offsetHeight ?? 240;
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: Math.max(
          8,
          rect.bottom + height + 8 < window.innerHeight ? rect.bottom + 8 : rect.top - height - 8,
        ),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    panel.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);
  useEffect(() => {
    const outside = (event: PointerEvent): void => {
      if (!panel.current?.contains(event.target as Node) && !anchor.contains(event.target as Node))
        onClose();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [anchor, onClose]);
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={`Pieza ${tooth}`}
      tabIndex={-1}
      style={position}
      className="fixed z-40 max-h-[calc(100dvh-16px)] w-72 max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-border bg-surface-raised p-3 text-foreground shadow-xl [&_button]:min-h-11"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
          anchor.focus({ preventScroll: true });
        }
      }}
    >
      <h3 className="font-semibold">Pieza {tooth}</h3>
      {children}
    </div>,
    document.body,
  );
}

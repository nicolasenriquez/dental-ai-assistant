import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DentalConditionModalProps {
  returnFocus?: HTMLElement | null;
  label: string;
  suspended: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function DentalConditionModal({
  label,
  suspended,
  onClose,
  children,
  returnFocus,
}: DentalConditionModalProps): JSX.Element {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const trigger = returnFocus ?? (document.activeElement as HTMLElement | null);
    panel.current?.focus({ preventScroll: true });
    return () => {
      window.requestAnimationFrame(() => {
        if (trigger?.isConnected && document.activeElement === document.body)
          trigger.focus({ preventScroll: true });
      });
    };
  }, [returnFocus]);
  useEffect(() => {
    if (suspended) return;
    const siblings = Array.from(document.body.children).filter(
      (node) => node !== panel.current?.parentElement,
    );
    const prior = siblings.map((node) => node.hasAttribute('inert'));
    for (const node of siblings) node.setAttribute('inert', '');
    return () =>
      siblings.forEach((node, index) => {
        if (!prior[index]) node.removeAttribute('inert');
      });
  }, [suspended]);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal={!suspended}
        aria-label={label}
        tabIndex={-1}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-4 text-foreground shadow-2xl [&_button]:min-h-11"
        onKeyDown={(event) => {
          if (suspended) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
          if (event.key !== 'Tab') return;
          const nodes = panel.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
          );
          if (!nodes?.length) {
            event.preventDefault();
            return;
          }
          const first = nodes[0];
          const last = nodes[nodes.length - 1];
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === panel.current)
          ) {
            event.preventDefault();
            last.focus();
          } else if (
            !event.shiftKey &&
            (document.activeElement === last || document.activeElement === panel.current)
          ) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

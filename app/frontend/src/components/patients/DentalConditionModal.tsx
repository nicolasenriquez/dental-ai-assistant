import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Modal lifetime focus order; disabled controls are not tabbable.
const focusableControls =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';

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
  useEffect(() => {
    if (suspended) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = panel.current?.querySelectorAll<HTMLElement>(focusableControls);
      if (!nodes?.length) {
        event.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      const outside = !panel.current?.contains(active);
      if (event.shiftKey && (active === first || active === panel.current || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || active === panel.current || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [suspended, onClose]);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal={!suspended}
        aria-label={label}
        tabIndex={-1}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-4 text-foreground shadow-2xl [&_button]:min-h-11"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

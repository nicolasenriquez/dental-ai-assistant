import { type ReactNode, createContext, useContext, useEffect, useMemo, useRef } from 'react';

export type TransitionBlocker = (continueTransition: () => void) => boolean;

export interface TransitionGuardApi {
  registerBlocker: (blocker: TransitionBlocker) => () => void;
  guardTransition: (continuation: () => void) => void;
  cancelTransition: () => void;
}

const TransitionGuardContext = createContext<TransitionGuardApi | null>(null);

function isGuardedLink(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  if (event.button !== 0 || event.defaultPrevented) return false;
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
  if (anchor.hasAttribute('download')) return false;
  if (anchor.target && anchor.target !== '_self') return false;

  const url = new URL(anchor.href, window.location.href);
  return url.origin === window.location.origin;
}

export function TransitionGuardProvider({ children }: { children: ReactNode }) {
  const blockerRef = useRef<TransitionBlocker | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  const bypassAnchorRef = useRef<HTMLAnchorElement | null>(null);

  const cancelTransition = () => {
    pendingRef.current = null;
  };

  const guardTransition = (continuation: () => void) => {
    const blocker = blockerRef.current;
    if (!blocker) {
      continuation();
      return;
    }
    if (pendingRef.current) return;

    let finished = false;
    const resume = () => {
      if (finished) return;
      finished = true;
      pendingRef.current = null;
      continuation();
    };
    pendingRef.current = resume;
    if (!blocker(resume)) resume();
  };

  const registerBlocker = (blocker: TransitionBlocker) => {
    blockerRef.current = blocker;
    return () => {
      if (blockerRef.current === blocker) {
        blockerRef.current = null;
        pendingRef.current = null;
      }
    };
  };

  const api = useMemo<TransitionGuardApi>(
    () => ({ registerBlocker, guardTransition, cancelTransition }),
    [],
  );

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || !isGuardedLink(event, anchor)) return;
      if (bypassAnchorRef.current === anchor) {
        bypassAnchorRef.current = null;
        return;
      }

      const blocker = blockerRef.current;
      if (!blocker) return;
      event.preventDefault();
      if (pendingRef.current) return;

      let finished = false;
      const resume = () => {
        if (finished) return;
        finished = true;
        pendingRef.current = null;
        bypassAnchorRef.current = anchor;
        anchor.click();
      };
      pendingRef.current = resume;
      if (!blocker(resume)) resume();
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  return <TransitionGuardContext.Provider value={api}>{children}</TransitionGuardContext.Provider>;
}

export function useTransitionGuard(): TransitionGuardApi {
  const guard = useContext(TransitionGuardContext);
  if (!guard) throw new Error('useTransitionGuard must be used inside a transition guard provider');
  return guard;
}

export function useOptionalTransitionGuard(): TransitionGuardApi | null {
  return useContext(TransitionGuardContext);
}

export function TransitionGuardBoundary({ children }: { children: ReactNode }) {
  const existing = useOptionalTransitionGuard();
  return existing ? children : <TransitionGuardProvider>{children}</TransitionGuardProvider>;
}

import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';

const FOLLOW_EPSILON_PX = 24;

export type FollowMode = 'following' | 'history';

export interface ChatAutoFollowResult {
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  bottomSentinelRef: MutableRefObject<HTMLDivElement | null>;
  followMode: FollowMode;
  isFollowingLatest: boolean;
  hasNewContentBelow: boolean;
  onScroll: () => void;
  onContentAppended: () => void;
  followLatest: (behavior?: ScrollBehavior) => void;
  jumpToLatest: () => void;
  restoreFollowMode: (mode: FollowMode) => void;
}

function isAtLatest(container: HTMLDivElement, sentinel: HTMLDivElement | null): boolean {
  if (sentinel) {
    const containerBounds = container.getBoundingClientRect();
    const sentinelBounds = sentinel.getBoundingClientRect();
    if (sentinelBounds.bottom <= containerBounds.bottom + FOLLOW_EPSILON_PX) return true;
  }

  return container.scrollHeight - container.scrollTop - container.clientHeight <= FOLLOW_EPSILON_PX;
}

function scrollToLatest(container: HTMLDivElement, behavior: ScrollBehavior): void {
  if (typeof container.scrollTo === 'function') {
    container.scrollTo({ top: container.scrollHeight, behavior });
    return;
  }
  container.scrollTop = container.scrollHeight;
}

export function useChatAutoFollow(): ChatAutoFollowResult {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const frameRef = useRef<number | null>(null);
  const [followMode, setFollowMode] = useState<FollowMode>('following');
  const [hasNewContentBelow, setHasNewContentBelow] = useState(false);

  const setFollowing = useCallback((following: boolean) => {
    followingRef.current = following;
    setFollowMode((current) => {
      const next = following ? 'following' : 'history';
      return current === next ? current : next;
    });
    if (following) {
      setHasNewContentBelow(false);
    }
  }, []);

  const followLatest = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const container = scrollContainerRef.current;
      setFollowing(true);

      if (container) {
        scrollToLatest(container, behavior);
      }
    },
    [setFollowing],
  );

  const jumpToLatest = useCallback(() => {
    followLatest('smooth');
  }, [followLatest]);

  const onScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setFollowing(isAtLatest(container, bottomSentinelRef.current));
  }, [setFollowing]);

  const onContentAppended = useCallback(() => {
    if (!followingRef.current) {
      setHasNewContentBelow(true);
      return;
    }

    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      if (followingRef.current) {
        const container = scrollContainerRef.current;
        if (container) {
          scrollToLatest(container, 'auto');
        }
        setHasNewContentBelow(false);
      }
    });
  }, []);

  const restoreFollowMode = useCallback(
    (mode: FollowMode) => {
      setFollowing(mode === 'following');
    },
    [setFollowing],
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    const sentinel = bottomSentinelRef.current;
    if (!container || !sentinel || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting && isAtLatest(container, sentinel)) {
          setFollowing(true);
        } else if (!entry.isIntersecting) {
          setFollowing(false);
        }
      },
      { root: container, threshold: 0.01 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [setFollowing]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return {
    scrollContainerRef,
    bottomSentinelRef,
    followMode,
    isFollowingLatest: followMode === 'following',
    hasNewContentBelow,
    onScroll,
    onContentAppended,
    followLatest,
    jumpToLatest,
    restoreFollowMode,
  };
}

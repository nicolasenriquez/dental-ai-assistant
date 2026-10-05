import { type RefObject, useCallback, useLayoutEffect, useRef } from 'react';

export interface ConversationViewportState {
  scrollTop: number;
  wasFollowingLatest: boolean;
}

interface UseConversationViewportCacheOptions {
  conversationId: string | null | undefined;
  scrollContainerRef: RefObject<HTMLElement | null>;
  isFollowingLatest: boolean;
}

export interface ConversationViewportCache {
  restoreViewport: (conversationId: string) => ConversationViewportState | null;
}

export function useConversationViewportCache({
  conversationId,
  scrollContainerRef,
  isFollowingLatest,
}: UseConversationViewportCacheOptions): ConversationViewportCache {
  const cacheRef = useRef(new Map<string, ConversationViewportState>());
  const previousConversationIdRef = useRef<string | null>(conversationId ?? null);
  const followingRef = useRef(isFollowingLatest);

  const saveViewport = useCallback(
    (id: string | null) => {
      const container = scrollContainerRef.current;
      if (!id || !container) return;

      cacheRef.current.set(id, {
        scrollTop: container.scrollTop,
        wasFollowingLatest: followingRef.current,
      });
    },
    [scrollContainerRef],
  );

  useLayoutEffect(() => {
    const previousConversationId = previousConversationIdRef.current;
    if (previousConversationId && previousConversationId !== conversationId) {
      saveViewport(previousConversationId);
    }
    previousConversationIdRef.current = conversationId ?? null;
    followingRef.current = isFollowingLatest;
  }, [conversationId, isFollowingLatest, saveViewport]);

  useLayoutEffect(() => {
    return () => saveViewport(previousConversationIdRef.current);
  }, [saveViewport]);

  const restoreViewport = useCallback((id: string) => {
    return cacheRef.current.get(id) ?? null;
  }, []);

  return { restoreViewport };
}

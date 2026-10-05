import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useConversationViewportCache } from './useConversationViewportCache';

describe('useConversationViewportCache', () => {
  it('stores scroll position and follow mode when changing conversations', () => {
    const container = document.createElement('div');
    container.scrollTop = 187;
    const scrollContainerRef = { current: container };
    const { result, rerender } = renderHook(
      ({ conversationId, isFollowingLatest }) =>
        useConversationViewportCache({
          conversationId,
          scrollContainerRef,
          isFollowingLatest,
        }),
      { initialProps: { conversationId: 'conversation-a', isFollowingLatest: false } },
    );

    rerender({ conversationId: 'conversation-b', isFollowingLatest: true });

    expect(result.current.restoreViewport('conversation-a')).toEqual({
      scrollTop: 187,
      wasFollowingLatest: false,
    });
    expect(result.current.restoreViewport('missing')).toBeNull();
  });
});

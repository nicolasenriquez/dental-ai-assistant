import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatAutoFollow } from './useChatAutoFollow';

function makeScrollContainer() {
  const container = document.createElement('div');
  Object.defineProperties(container, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 300 },
  });
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    bottom: 100,
    left: 0,
    right: 100,
    width: 100,
    height: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  return container;
}

describe('useChatAutoFollow', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('stops following when the reader moves into history and marks new content', () => {
    const { result } = renderHook(() => useChatAutoFollow());
    const container = makeScrollContainer();
    const sentinel = document.createElement('div');
    vi.spyOn(sentinel, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          top: 300 - container.scrollTop,
          bottom: 301 - container.scrollTop,
          left: 0,
          right: 1,
          width: 1,
          height: 1,
          x: 0,
          y: 300 - container.scrollTop,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    sentinel.scrollIntoView = vi.fn();
    result.current.scrollContainerRef.current = container;
    result.current.bottomSentinelRef.current = sentinel;

    act(() => {
      container.scrollTop = 40;
      result.current.onScroll();
      result.current.onContentAppended();
    });

    expect(result.current.followMode).toBe('history');
    expect(result.current.hasNewContentBelow).toBe(true);
    expect(sentinel.scrollIntoView).not.toHaveBeenCalled();
  });

  it('follows appended content and jumps back to the latest message', () => {
    const { result } = renderHook(() => useChatAutoFollow());
    const container = makeScrollContainer();
    const sentinel = document.createElement('div');
    vi.spyOn(sentinel, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          top: 300 - container.scrollTop,
          bottom: 301 - container.scrollTop,
          left: 0,
          right: 1,
          width: 1,
          height: 1,
          x: 0,
          y: 300 - container.scrollTop,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    sentinel.scrollIntoView = vi.fn();
    result.current.scrollContainerRef.current = container;
    result.current.bottomSentinelRef.current = sentinel;

    act(() => {
      container.scrollTop = 200;
      result.current.onScroll();
      result.current.onContentAppended();
    });
    expect(result.current.followMode).toBe('following');
    expect(container.scrollTop).toBe(container.scrollHeight);

    act(() => {
      container.scrollTop = 20;
      result.current.onScroll();
      result.current.jumpToLatest();
    });
    expect(result.current.followMode).toBe('following');
    expect(result.current.hasNewContentBelow).toBe(false);
    expect(container.scrollTop).toBe(container.scrollHeight);
  });
});

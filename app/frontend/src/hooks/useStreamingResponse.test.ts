import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type StreamResult, useStreamingResponse } from './useStreamingResponse';

function makeSseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function createControlledStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(nextController) {
      controller = nextController;
    },
  });

  return {
    stream,
    push(chunk: string) {
      controller.enqueue(encoder.encode(chunk));
    },
    close() {
      controller.close();
    },
    fail(error: unknown) {
      controller.error(error);
    },
  };
}

const mockCitation = {
  chunk_id: 'chunk-1',
  video_id: 'vid-1',
  video_title: 'Test Video',
  video_url: 'https://www.youtube.com/watch?v=abc123',
  start_seconds: 10,
  end_seconds: 20,
  snippet: 'Test snippet text',
};

describe('useStreamingResponse', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('returns the parsed answer and sources for one conversation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: makeSseStream([
          `event: sources\ndata: ${JSON.stringify([mockCitation])}\n\n`,
          'data: "Answer here."\n\n',
          'data: [DONE]\n\n',
        ]),
      }),
    );

    const { result } = renderHook(() => useStreamingResponse());
    let streamResult: StreamResult | null | undefined;

    await act(async () => {
      streamResult = await result.current.startStream('conv-1', 'hi');
    });

    expect(streamResult).toEqual({ fullText: 'Answer here.', sources: [mockCitation] });
    expect(result.current.runtimeByConversationId['conv-1']).toMatchObject({
      status: 'running',
      phase: 'completed',
      content: 'Answer here.',
    });
    act(() => result.current.clearRuntime('conv-1'));
    expect(result.current.runtimeByConversationId).toEqual({});
  });

  it('keeps simultaneous streams isolated by conversation id', async () => {
    const streams = { a: createControlledStream(), b: createControlledStream() };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const id = String(input).includes('/a/') ? 'a' : 'b';
        return Promise.resolve({ ok: true, status: 200, body: streams[id].stream });
      }),
    );

    const { result } = renderHook(() => useStreamingResponse());
    let aPromise = Promise.resolve<StreamResult | null>(null);
    let bPromise = Promise.resolve<StreamResult | null>(null);
    await act(async () => {
      aPromise = result.current.startStream('a', 'Question A');
      bPromise = result.current.startStream('b', 'Question B');
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.runtimeByConversationId.a?.status).toBe('running');
      expect(result.current.runtimeByConversationId.b?.status).toBe('running');
    });

    await act(async () => {
      streams.a.push('data: "Answer A"\n\n');
    });
    expect(result.current.runtimeByConversationId.a?.content).toBe('Answer A');
    expect(result.current.runtimeByConversationId.b?.content).toBe('');

    await act(async () => {
      streams.b.push('data: "Answer B"\n\n');
    });
    expect(result.current.runtimeByConversationId.b?.content).toBe('Answer B');

    await act(async () => {
      streams.a.push('data: [DONE]\n\n');
      streams.a.close();
      streams.b.push('data: [DONE]\n\n');
      streams.b.close();
      await Promise.all([aPromise, bPromise]);
    });

    expect(result.current.runtimeByConversationId.a?.phase).toBe('completed');
    expect(result.current.runtimeByConversationId.b?.phase).toBe('completed');
    act(() => {
      result.current.clearRuntime('a');
      result.current.clearRuntime('b');
    });
  });

  it('aborts only the requested conversation stream', async () => {
    const streams = { a: createControlledStream(), b: createControlledStream() };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const id = String(input).includes('/a/') ? 'a' : 'b';
        init?.signal?.addEventListener('abort', () => {
          streams[id].fail(new DOMException('Aborted', 'AbortError'));
        });
        return Promise.resolve({ ok: true, status: 200, body: streams[id].stream });
      }),
    );

    const { result } = renderHook(() => useStreamingResponse());
    let aPromise = Promise.resolve<StreamResult | null>(null);
    let bPromise = Promise.resolve<StreamResult | null>(null);
    await act(async () => {
      aPromise = result.current.startStream('a', 'Question A');
      bPromise = result.current.startStream('b', 'Question B');
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.runtimeByConversationId.a?.status).toBe('running'));

    await act(async () => {
      result.current.abortStream('a');
      await expect(aPromise).resolves.toMatchObject({ fullText: '', stopped: true });
    });

    expect(result.current.runtimeByConversationId.a?.phase).toBe('stopping');
    expect(result.current.runtimeByConversationId.b?.status).toBe('running');

    await act(async () => {
      streams.b.push('data: "Answer B"\n\n');
      streams.b.push('data: [DONE]\n\n');
      streams.b.close();
      await bPromise;
    });
    act(() => {
      result.current.clearRuntime('a');
      result.current.clearRuntime('b');
    });
    expect(result.current.runtimeByConversationId).toEqual({});
  });

  it('keeps an error on its owner and clears that runtime independently', async () => {
    const bStream = createControlledStream();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).includes('/a/')) {
          return Promise.resolve({ ok: false, status: 500, body: null, text: async () => '' });
        }
        return Promise.resolve({ ok: true, status: 200, body: bStream.stream });
      }),
    );

    const { result } = renderHook(() => useStreamingResponse());
    await act(async () => {
      await expect(result.current.startStream('a', 'Question A')).rejects.toThrow('HTTP 500');
    });
    expect(result.current.runtimeByConversationId.a?.status).toBe('error');

    let bPromise = Promise.resolve<StreamResult | null>(null);
    await act(async () => {
      bPromise = result.current.startStream('b', 'Question B');
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.runtimeByConversationId.b?.status).toBe('running'));
    expect(result.current.runtimeByConversationId.b?.error).toBeNull();

    act(() => result.current.clearRuntime('a'));
    expect(result.current.runtimeByConversationId.a).toBeUndefined();
    expect(result.current.runtimeByConversationId.b?.status).toBe('running');

    await act(async () => {
      bStream.push('data: "Answer B"\n\n');
      bStream.push('data: [DONE]\n\n');
      bStream.close();
      await bPromise;
    });
  });

  it('warns and continues when a status event is malformed', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: makeSseStream(['event: status\ndata: not valid json {\n\n', 'data: "Answer"\n\n']),
      }),
    );

    const { result } = renderHook(() => useStreamingResponse());
    await act(async () => {
      await result.current.startStream('conv-1', 'hi');
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[useStreamingResponse] Failed to parse status event:',
      expect.any(Error),
    );
  });

  it('keeps the final token when the stream closes without a frame delimiter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: makeSseStream(['data: "respuesta final"']),
      }),
    );

    const { result } = renderHook(() => useStreamingResponse());
    let streamResult: StreamResult | null | undefined;
    await act(async () => {
      streamResult = await result.current.startStream('conv-1', 'hi');
    });

    expect(streamResult?.fullText).toBe('respuesta final');
    expect(result.current.runtimeByConversationId['conv-1']?.content).toBe('respuesta final');
  });

  it('is safe to abort or clear an idle conversation', () => {
    const { result } = renderHook(() => useStreamingResponse());
    expect(() => result.current.abortStream('missing')).not.toThrow();
    expect(() => result.current.clearRuntime('missing')).not.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { consumeSse } from './sse';

describe('consumeSse', () => {
  it('frames multiline data and ignores heartbeats', async () => {
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
          controller.enqueue(encoder.encode('event: clinical\ndata: first\ndata: second\n\n'));
          controller.close();
        },
      }),
    );
    const events: Array<{ event: string | null; data: string }> = [];
    await consumeSse(response, (event) => events.push(event));
    expect(events).toEqual([{ event: 'clinical', data: 'first\nsecond' }]);
  });

  it('accepts CRLF-delimited frames', async () => {
    const response = new Response('event: clinical\r\ndata: {"ok":true}\r\n\r\n');
    const events: Array<{ event: string | null; data: string }> = [];
    await consumeSse(response, (event) => events.push(event));
    expect(events).toEqual([{ event: 'clinical', data: '{"ok":true}' }]);
  });

  it('honors an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const response = new Response(new ReadableStream());
    await expect(consumeSse(response, () => undefined, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

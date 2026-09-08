export interface SseEvent {
  event: string | null;
  data: string;
}

export async function consumeSse(
  response: Response,
  onEvent: (event: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body) throw new Error('No response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let aborted = false;

  const onAbort = () => {
    aborted = true;
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  const emitFrames = (flush: boolean) => {
    buffer = buffer.replace(/\r\n/g, '\n');
    const parts = buffer.split('\n\n');
    buffer = flush ? '' : (parts.pop() ?? '');
    for (const rawEvent of parts) {
      if (!rawEvent.trim()) continue;
      let event: string | null = null;
      const dataLines: string[] = [];
      for (const line of rawEvent.split(/\r?\n/)) {
        if (line.startsWith(':')) continue;
        if (line.startsWith('event:')) {
          event = line.slice(6).trim() || null;
        } else if (line.startsWith('data:')) {
          const value = line.slice(5);
          dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
        }
      }
      if (dataLines.length > 0) onEvent({ event, data: dataLines.join('\n') });
    }
  };

  try {
    while (true) {
      if (signal?.aborted || aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (aborted) throw new DOMException('Aborted', 'AbortError');
      emitFrames(done);
      if (done) break;
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

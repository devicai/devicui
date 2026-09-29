/**
 * How long a frame may stay half-received before the caller is told.
 *
 * WebKit (Safari, every iOS browser) can hold the end of what just arrived on
 * a streamed fetch until more bytes come in. When nothing follows, the rest of
 * the frame — often the one saying the run now waits on this client — only
 * shows up with the next keep-alive. A frame that started arriving and then
 * stopped for this long is presumed held, and `onStall` lets the caller read
 * the state another way.
 */
export const STREAM_STALL_MS = 1_000;

/**
 * Consume Devic's version-1 SSE frames, tolerating arbitrary UTF-8/chunk
 * boundaries. `snapshot` frames carry the whole state. When the stream was
 * opened with `?partial=1`, changes to the reply being written arrive as
 * `partial` frames (the whole `streamingMessage`) or `delta` frames (only the
 * text appended to it); both are merged into the last snapshot, so the caller
 * always receives a full state. `onActivity` fires on every chunk, keep-alive
 * comments included, so the caller can tell a quiet connection from a dead one.
 * `onStall` fires when a frame has been left half-received for
 * `STREAM_STALL_MS` (see there); the stream itself carries on.
 */
export async function consumeChatStream<T extends object>(
  response: Response,
  onSnapshot: (snapshot: T) => void | Promise<void>,
  onActivity?: () => void,
  onStall?: () => void,
): Promise<void> {
  if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
    throw new Error('Chat streaming unavailable');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let last: (T & { streamingMessage?: any }) | undefined;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    while (true) {
      // Armed only while a frame is incomplete; any bytes cancel it.
      if (onStall && buffer.trim()) stallTimer = setTimeout(onStall, STREAM_STALL_MS);
      const { value, done } = await reader.read();
      clearTimeout(stallTimer);
      stallTimer = undefined;
      if (done) break;
      onActivity?.();
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      if (buffer.length > 16 * 1024 * 1024) throw new Error('Chat stream frame too large');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const lines = frame.split('\n');
        const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
        if (event !== 'snapshot' && event !== 'partial' && event !== 'delta') continue;
        const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data) continue;
        const parsed = JSON.parse(data);
        if (event === 'snapshot') {
          last = parsed;
        } else if (!last) {
          // Nothing to merge into yet; the next snapshot carries everything.
          continue;
        } else if (event === 'partial') {
          last = { ...last, ...parsed };
        } else {
          const message = last.streamingMessage;
          if (!message || typeof parsed.append !== 'string') continue;
          last = {
            ...last,
            streamingMessage: {
              ...message,
              content: { ...message.content, message: `${message.content?.message ?? ''}${parsed.append}` },
            },
          };
        }
        await onSnapshot(last as T);
      }
    }
  } finally {
    clearTimeout(stallTimer);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

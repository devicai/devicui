/** Consume Devic's version-1 SSE snapshots, tolerating arbitrary UTF-8/chunk boundaries. */
export async function consumeChatStream<T>(response: Response, onSnapshot: (snapshot: T) => void | Promise<void>): Promise<void> {
  if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
    throw new Error('Chat streaming unavailable');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      if (buffer.length > 16 * 1024 * 1024) throw new Error('Chat stream frame too large');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const lines = frame.split('\n');
        if (!lines.some(line => line === 'event: snapshot')) continue;
        const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (data) await onSnapshot(JSON.parse(data));
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}


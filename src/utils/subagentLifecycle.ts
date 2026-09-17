import { AgentThreadState } from '../api/types';

const MAX_CACHED_THREADS = 200;

type Listener = () => void;

const states = new Map<string, AgentThreadState>();
const listeners = new Set<Listener>();

/**
 * Share lifecycle snapshots already received by detailed subagent widgets.
 *
 * The prompt tray is a sibling of the message timeline, so React props cannot
 * carry the child thread's SSE snapshot across without making ChatDrawer own a
 * second copy of the monitoring logic. This tiny process-local cache keeps the
 * snapshot keyed by the globally unique thread id and lets the tray reuse the
 * existing stream instead of opening another connection per subagent.
 */
export function publishSubagentLifecycle(
  threadId: string,
  state: AgentThreadState,
): void {
  if (!threadId || states.get(threadId) === state) return;

  // Refresh insertion order so active conversations survive the bounded cache.
  states.delete(threadId);
  states.set(threadId, state);
  if (states.size > MAX_CACHED_THREADS) {
    const oldestThreadId = states.keys().next().value;
    if (oldestThreadId) states.delete(oldestThreadId);
  }

  listeners.forEach((listener) => listener());
}

export function readSubagentLifecycle(
  threadId: string,
): AgentThreadState | undefined {
  return states.get(threadId);
}

export function subscribeSubagentLifecycle(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

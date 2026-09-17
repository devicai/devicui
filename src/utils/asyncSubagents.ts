import type { ChatMessage, HandOffToolResponse } from '../api/types';
import { subagentHandoffLaunches } from './subagentHandoffs';

/**
 * Async handoffs can outlive the parent turn. Their launch acknowledgement and
 * synthetic result are both durable chat messages, so their set difference is
 * the authoritative reason a completed conversation must remain observed.
 */
export function pendingAsyncSubagentIds(
  messages: ChatMessage[] = []
): string[] {
  const launched = new Set<string>();
  const delivered = new Set<string>();

  for (const message of messages) {
    const content = message.content as any;
    if (
      message.role === 'tool' &&
      (content?.asynchronous === true || content?.executionMode === 'async')
    ) {
      for (const launch of subagentHandoffLaunches(
        content as HandOffToolResponse
      )) {
        launched.add(launch.threadId);
      }
    }

    if (message.subagent?.threadId) {
      delivered.add(String(message.subagent.threadId));
    }
    for (const result of content?.data?.subagentResults || []) {
      if (result?.subagent?.threadId) {
        delivered.add(String(result.subagent.threadId));
      }
    }

    const text = content?.message;
    if (typeof text === 'string') {
      for (const match of text.matchAll(
        /\[Async subagent result\][\s\S]*?Subthread:\s*([^\s]+)/g
      )) {
        delivered.add(match[1]);
      }
    }
  }

  return [...launched].filter((threadId) => !delivered.has(threadId));
}

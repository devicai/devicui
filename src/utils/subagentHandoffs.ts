import type { HandOffToolResponse } from '../api/types';

export interface SubagentHandoffLaunch {
  threadId: string;
  agent?: NonNullable<HandOffToolResponse['agent']>;
  error?: string;
}

/**
 * Normalize legacy single handoffs and batched handoffs into one shape.
 *
 * The backend keeps the old fields for persisted conversations while new
 * assistant calls return `executions[]`, one independently monitored thread per
 * requested job (including repeated uses of the same configured agent).
 */
export function subagentHandoffLaunches(
  response?: HandOffToolResponse | null,
): SubagentHandoffLaunch[] {
  if (!response) return [];

  if (Array.isArray(response.executions)) {
    return response.executions.flatMap((execution) => {
      const threadId = execution.subThreadId ?? execution.subthreadId;
      return threadId
        ? [
            {
              threadId: String(threadId),
              agent: execution.agent,
              error: execution.error,
            },
          ]
        : [];
    });
  }

  const threadId = response.subThreadId ?? response.subthreadId;
  return threadId
    ? [{ threadId: String(threadId), agent: response.agent }]
    : [];
}

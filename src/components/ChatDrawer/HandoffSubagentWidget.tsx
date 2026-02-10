import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOptionalDevicContext } from '../../provider';
import { DevicApiClient } from '../../api/client';
import { AgentThreadState } from '../../api/types';
import type { AgentThreadDto, AgentDto } from '../../api/types';
import { ThreadStateTag } from '../ThreadStateTag';

const TERMINAL_STATES: AgentThreadState[] = [
  AgentThreadState.COMPLETED,
  AgentThreadState.FAILED,
  AgentThreadState.TERMINATED,
];

const POLL_INTERVAL_MS = 5000;

export interface HandoffSubagentWidgetProps {
  /**
   * The subthread ID to monitor
   */
  subThreadId: string;

  /**
   * Called when the subthread reaches a terminal state
   */
  onCompleted?: () => void;

  /**
   * API key (overrides provider context)
   */
  apiKey?: string;

  /**
   * Base URL (overrides provider context)
   */
  baseUrl?: string;

  /**
   * Custom renderer to replace the entire widget content.
   * Receives the thread and agent data.
   */
  renderWidget?: (props: {
    thread: AgentThreadDto | null;
    agent: AgentDto | null;
    elapsedSeconds: number;
    isTerminal: boolean;
  }) => React.ReactNode;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function HandoffSubagentWidget({
  subThreadId,
  onCompleted,
  apiKey,
  baseUrl,
  renderWidget,
}: HandoffSubagentWidgetProps): JSX.Element {
  const context = useOptionalDevicContext();
  const resolvedApiKey = apiKey || context?.apiKey;
  const resolvedBaseUrl = baseUrl || context?.baseUrl || 'https://api.devic.ai';

  const [thread, setThread] = useState<AgentThreadDto | null>(null);
  const [agent, setAgent] = useState<AgentDto | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasCalledCompleted = useRef(false);
  const startTimeRef = useRef(Date.now());

  const getClient = useCallback((): DevicApiClient | null => {
    if (!resolvedApiKey) return null;
    return new DevicApiClient({ apiKey: resolvedApiKey, baseUrl: resolvedBaseUrl });
  }, [resolvedApiKey, resolvedBaseUrl]);

  const fetchThread = useCallback(async () => {
    const client = getClient();
    if (!client) return;

    try {
      const data = await client.getThreadById(subThreadId, true);
      console.log('[HandoffSubagentWidget] Thread loaded:', {
        id: data._id,
        agentId: data.agentId,
        parentAgentId: data.parentAgentId,
        name: data.name,
        state: data.state,
      });
      setThread(data);

      if (
        data.state &&
        TERMINAL_STATES.includes(data.state) &&
        !hasCalledCompleted.current
      ) {
        hasCalledCompleted.current = true;
        onCompleted?.();
      }
    } catch (err) {
      console.error('[HandoffSubagentWidget] Error fetching thread:', err);
    }
  }, [subThreadId, getClient, onCompleted]);

  // Initial fetch + polling
  useEffect(() => {
    fetchThread();
    pollRef.current = setInterval(fetchThread, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchThread]);

  // Fetch agent details once we have a thread with an agent ID
  const agentIdToFetch = thread?.agentId || thread?.parentAgentId;
  useEffect(() => {
    if (!agentIdToFetch || agent) return;
    const client = getClient();
    if (!client) {
      console.warn('[HandoffSubagentWidget] No API client available (missing apiKey?)');
      return;
    }

    console.log('[HandoffSubagentWidget] Fetching agent details for:', agentIdToFetch);
    client.getAgentDetails(agentIdToFetch).then((data) => {
      console.log('[HandoffSubagentWidget] Agent details loaded:', data?.name);
      setAgent(data);
    }).catch((err) => {
      console.warn('[HandoffSubagentWidget] Could not fetch agent details:', err);
    });
  }, [agentIdToFetch, agent, getClient]);

  // Stop polling on terminal state
  useEffect(() => {
    if (thread?.state && TERMINAL_STATES.includes(thread.state)) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }, [thread?.state]);

  // Elapsed timer
  useEffect(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Stop timer on terminal
  useEffect(() => {
    if (thread?.state && TERMINAL_STATES.includes(thread.state)) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [thread?.state]);

  // Computed
  const isTerminal = !!(thread?.state && TERMINAL_STATES.includes(thread.state));
  const isProcessing = thread?.state === AgentThreadState.PROCESSING || thread?.state === AgentThreadState.HANDED_OFF;
  const totalTasks = thread?.tasks?.length || 0;
  const completedTasks = thread?.tasks?.filter((t) => t.completed).length || 0;
  const taskPercentage = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const lastMessage = thread?.threadContent?.[thread.threadContent.length - 1];
  const lastSummary = lastMessage?.summary;

  // Custom renderer
  if (renderWidget) {
    return <>{renderWidget({ thread, agent, elapsedSeconds, isTerminal })}</>;
  }

  return (
    <div className="devic-handoff-widget">
      {/* Header: Agent avatar + name */}
      <div className="devic-handoff-header">
        <div className="devic-handoff-agent-avatar">
          {agent?.imgUrl ? (
            <img src={agent.imgUrl} alt="" className="devic-handoff-avatar-img" />
          ) : (
            <RobotFallbackIcon />
          )}
        </div>
        <span className="devic-handoff-agent-name">
          {agent?.name || thread?.name || 'Subagent'}
        </span>
      </div>

      {/* State tag */}
      {thread?.state && (
        <div className="devic-handoff-state-row">
          <ThreadStateTag
            state={thread.state}
            threadId={thread._id || subThreadId}
            agentName={agent?.name || thread?.name || 'Subagent'}
            pausedReason={thread.pausedReason}
            finishReason={thread.finishReason}
            pauseUntil={thread.pauseUntil}
            interactive={true}
            apiKey={resolvedApiKey}
            baseUrl={resolvedBaseUrl}
          />
        </div>
      )}

      {/* Progress bar */}
      {totalTasks > 0 && (
        <div className="devic-handoff-progress">
          <div className="devic-handoff-progress-bar">
            <div
              className="devic-handoff-progress-fill"
              data-status={thread?.state === AgentThreadState.FAILED ? 'error' : isTerminal ? 'success' : 'active'}
              style={{ width: `${taskPercentage}%` }}
            />
          </div>
          <span className="devic-handoff-progress-text">
            {completedTasks}/{totalTasks}
          </span>
        </div>
      )}

      {/* Indeterminate progress when no tasks */}
      {totalTasks === 0 && isProcessing && (
        <div className="devic-handoff-progress">
          <div className="devic-handoff-progress-bar">
            <div className="devic-handoff-progress-indeterminate" />
          </div>
        </div>
      )}

      {/* Last message summary */}
      {lastSummary && (
        <div className={`devic-handoff-summary ${isProcessing ? 'devic-handoff-summary-active' : ''}`}>
          {lastSummary}
        </div>
      )}

      {/* Elapsed time */}
      {isProcessing && (
        <div className="devic-handoff-elapsed">
          <ClockSmallIcon />
          <span>{formatElapsed(elapsedSeconds)}</span>
        </div>
      )}
    </div>
  );
}

/* ── Icons ── */

function RobotFallbackIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#999">
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <circle cx="9" cy="14" r="2" fill="#fff" />
      <circle cx="15" cy="14" r="2" fill="#fff" />
      <line x1="12" y1="2" x2="12" y2="8" stroke="#999" strokeWidth="2" />
      <circle cx="12" cy="2" r="1.5" />
    </svg>
  );
}

function ClockSmallIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  );
}

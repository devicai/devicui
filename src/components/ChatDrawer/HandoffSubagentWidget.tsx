import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useOptionalDevicContext } from '../../provider';
import { DevicApiClient } from '../../api/client';
import { AgentThreadState } from '../../api/types';
import type { AgentThreadDto, AgentDto } from '../../api/types';
import { ThreadStateTag } from '../ThreadStateTag';
import {
  resolvePollingInterval,
  resolveStreaming,
  usePolling,
} from '../../hooks/usePolling';
import { createLogger } from '../../utils/logger';
import { avatarUri } from '../../utils/avatar';
import { useTranslations } from '../../i18n';

const TERMINAL_STATES: AgentThreadState[] = [
  AgentThreadState.COMPLETED,
  AgentThreadState.FAILED,
  AgentThreadState.TERMINATED,
  AgentThreadState.APPROVAL_REJECTED,
  AgentThreadState.GUARDRAIL_TRIGGER,
  AgentThreadState.LIMIT_EXCEEDED,
];

/**
 * The subagent runs for as long as it runs, so watching it does not need the
 * main conversation's rhythm. A configured `pollingInterval` still wins.
 */
const DEFAULT_POLL_INTERVAL_MS = 5000;

export interface HandoffSubagentWidgetProps {
  /**
   * The subthread ID to monitor
   */
  subThreadId: string;

  /** Identity returned by the handoff acknowledgement, shown before polling. */
  agentHint?: Pick<AgentDto, '_id' | 'name' | 'imgUrl' | 'avatarStyle'>;

  /** Optional initial snapshot, useful while the first poll is pending. */
  threadHint?: AgentThreadDto;

  /**
   * Called when the subthread reaches a terminal state
   */
  onCompleted?: () => void;

  /** Called whenever a fresh lifecycle snapshot changes the thread state. */
  onStateChange?: (state: AgentThreadState) => void;

  /**
   * API key (overrides provider context)
   */
  apiKey?: string;

  /**
   * Base URL (overrides provider context)
   */
  baseUrl?: string;

  /**
   * How often (ms) the subthread is polled while it runs. Overrides the
   * DevicProvider's `pollingInterval`. Values below 250 ms are clamped.
   * @default 5000
   */
  pollingInterval?: number;

  /**
   * Follow lifecycle snapshots over SSE, with polling retained as fallback.
   * Overrides the DevicProvider setting.
   */
  streaming?: boolean;

  /**
   * Render as a collapsible row inside an aggregate handoff widget.
   * Polling/SSE and completion callbacks remain independent per subthread.
   * @default false
   */
  compact?: boolean;

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
  agentHint,
  threadHint,
  onCompleted,
  onStateChange,
  apiKey,
  baseUrl,
  pollingInterval,
  streaming,
  compact = false,
  renderWidget,
}: HandoffSubagentWidgetProps): JSX.Element {
  const t = useTranslations();
  const context = useOptionalDevicContext();
  const resolvedApiKey = apiKey || context?.apiKey;
  const resolvedBaseUrl = baseUrl || context?.baseUrl || 'https://api.devic.ai';
  const resolvedPollInterval = resolvePollingInterval(
    pollingInterval,
    context?.pollingInterval,
    DEFAULT_POLL_INTERVAL_MS
  );
  const resolvedStreaming = resolveStreaming(streaming, context?.streaming);
  const debug = context?.debug ?? false;
  const log = useMemo(() => createLogger(debug), [debug]);

  const [thread, setThread] = useState<AgentThreadDto | null>(threadHint || null);
  const [agent, setAgent] = useState<AgentDto | null>(agentHint as AgentDto | null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasCalledCompleted = useRef(false);
  const startTimeRef = useRef(Date.now());

  const resolvedTenantSession = context?.getTenantSession;
  const onSessionExpired = context?.onSessionExpired;
  const getClient = useCallback((): DevicApiClient | null => {
    if (!resolvedApiKey && !resolvedTenantSession) return null;
    return new DevicApiClient({
      apiKey: resolvedApiKey,
      baseUrl: resolvedBaseUrl,
      getTenantSession: resolvedTenantSession,
      onSessionExpired,
    });
  }, [resolvedApiKey, resolvedTenantSession, resolvedBaseUrl]);

  const fetchThread = useCallback(async (): Promise<AgentThreadDto> => {
    const client = getClient();
    if (!client) throw new Error('No API client available');
    // Keep lifecycle polling on the lightweight thread read. `withTasks`
    // also calls Task and Template services server-side; if either one is
    // unavailable the status would never reach the card.
    return client.getThreadById(subThreadId, false);
  }, [subThreadId, getClient]);

  const acceptThread = useCallback((data: AgentThreadDto) => {
    log.log('[HandoffSubagentWidget] Thread loaded:', {
      id: data._id,
      agentId: data.agentId,
      parentAgentId: data.parentAgentId,
      name: data.name,
      state: data.state,
    });
    setThread(data);
    if (data.state) onStateChange?.(data.state);
    if (
      data.state &&
      TERMINAL_STATES.includes(data.state) &&
      !hasCalledCompleted.current
    ) {
      hasCalledCompleted.current = true;
      onCompleted?.();
    }
  }, [log, onCompleted, onStateChange]);

  const streamThread = useCallback((
    onSnapshot: (data: AgentThreadDto) => Promise<void>,
    signal: AbortSignal,
    onActivity?: () => void,
  ) => {
    const client = getClient();
    if (!client) return Promise.reject(new Error('No API client available'));
    return client.streamThread(subThreadId, onSnapshot, signal, onActivity);
  }, [getClient, subThreadId]);

  usePolling<AgentThreadDto>(subThreadId, fetchThread, {
    interval: resolvedPollInterval,
    streamFn: resolvedStreaming ? streamThread : undefined,
    getStatus: (data) => data.state,
    stopStatuses: TERMINAL_STATES,
    onUpdate: acceptThread,
    onError: (error) =>
      log.error('[HandoffSubagentWidget] Error loading thread:', error),
    debug,
  });

  // Fetch agent details once we have a thread with an agent ID
  const agentIdToFetch = thread?.agentId || thread?.parentAgentId;
  useEffect(() => {
    if (!agentIdToFetch || agent) return;
    const client = getClient();
    if (!client) {
      log.warn('[HandoffSubagentWidget] No API client available (missing apiKey?)');
      return;
    }

    log.log('[HandoffSubagentWidget] Fetching agent details for:', agentIdToFetch);
    client.getAgentDetails(agentIdToFetch).then((data) => {
      log.log('[HandoffSubagentWidget] Agent details loaded:', data?.name);
      setAgent(data);
    }).catch((err) => {
      log.warn('[HandoffSubagentWidget] Could not fetch agent details:', err);
    });
  }, [agentIdToFetch, agent, getClient]);

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

  const agentName = agent?.name || thread?.name || t('Subagent');

  if (compact) {
    const state = thread?.state;
    const status = compactStateStatus(state);

    return (
      <details className="devic-handoff-compact" data-status={status}>
        <summary className="devic-handoff-compact-summary">
          <span className="devic-handoff-agent-avatar">
            {agent?.imgUrl || agent?._id ? (
              <img
                src={agent.imgUrl || avatarUri(agent._id!, agent.avatarStyle)}
                alt=""
                className="devic-handoff-avatar-img"
              />
            ) : (
              <RobotFallbackIcon />
            )}
          </span>
          <span className="devic-handoff-compact-copy">
            <span className="devic-handoff-agent-name">{agentName}</span>
            {lastSummary && (
              <span className="devic-handoff-compact-preview">{lastSummary}</span>
            )}
          </span>
          <span className="devic-handoff-compact-state">
            <i aria-hidden="true" />
            {compactStateLabel(t, state)}
          </span>
          <CompactChevronIcon />
        </summary>

        <div className="devic-handoff-compact-body">
          {state && (
            <div className="devic-handoff-state-row">
              <ThreadStateTag
                state={state}
                threadId={thread._id || subThreadId}
                agentName={agentName}
                pausedReason={thread.pausedReason}
                finishReason={thread.finishReason}
                pauseUntil={thread.pauseUntil}
                interactive={true}
                apiKey={resolvedApiKey}
                baseUrl={resolvedBaseUrl}
              />
            </div>
          )}

          {totalTasks > 0 && (
            <div className="devic-handoff-progress">
              <div className="devic-handoff-progress-bar">
                <div
                  className="devic-handoff-progress-fill"
                  data-status={state === AgentThreadState.FAILED ? 'error' : isTerminal ? 'success' : 'active'}
                  style={{ width: `${taskPercentage}%` }}
                />
              </div>
              <span className="devic-handoff-progress-text">
                {completedTasks}/{totalTasks}
              </span>
            </div>
          )}

          {totalTasks === 0 && isProcessing && (
            <div className="devic-handoff-progress">
              <div className="devic-handoff-progress-bar">
                <div className="devic-handoff-progress-indeterminate" />
              </div>
            </div>
          )}

          {lastSummary && <div className="devic-handoff-summary">{lastSummary}</div>}

          {isProcessing && (
            <div className="devic-handoff-elapsed">
              <ClockSmallIcon />
              <span>{formatElapsed(elapsedSeconds)}</span>
            </div>
          )}
        </div>
      </details>
    );
  }

  return (
    <div className="devic-handoff-widget">
      {/* Header: Agent avatar + name */}
      <div className="devic-handoff-header">
        <div className="devic-handoff-agent-avatar">
          {/* The subagent's own face — uploaded, or generated from its id. The
              robot glyph is kept for the case where the hand-off names no
              agent at all, which is the only time there is nothing to draw. */}
          {agent?.imgUrl || agent?._id ? (
            <img
              src={agent.imgUrl || avatarUri(agent._id!, agent.avatarStyle)}
              alt=""
              className="devic-handoff-avatar-img"
            />
          ) : (
            <RobotFallbackIcon />
          )}
        </div>
        <span className="devic-handoff-agent-name">
          {agentName}
        </span>
      </div>

      {/* State tag */}
      {thread?.state && (
        <div className="devic-handoff-state-row">
          <ThreadStateTag
            state={thread.state}
            threadId={thread._id || subThreadId}
            agentName={agentName}
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

type CompactStateStatus = 'loading' | 'queued' | 'running' | 'completed' | 'paused' | 'failed';

function compactStateStatus(state?: AgentThreadState): CompactStateStatus {
  switch (state) {
    case AgentThreadState.COMPLETED:
      return 'completed';
    case AgentThreadState.FAILED:
    case AgentThreadState.TERMINATED:
    case AgentThreadState.APPROVAL_REJECTED:
    case AgentThreadState.GUARDRAIL_TRIGGER:
    case AgentThreadState.LIMIT_EXCEEDED:
      return 'failed';
    case AgentThreadState.PROCESSING:
    case AgentThreadState.HANDED_OFF:
      return 'running';
    case AgentThreadState.PAUSED:
    case AgentThreadState.PAUSED_FOR_APPROVAL:
    case AgentThreadState.PAUSED_FOR_RESUME:
    case AgentThreadState.WAITING_FOR_RESPONSE:
      return 'paused';
    case AgentThreadState.QUEUED:
      return 'queued';
    default:
      return 'loading';
  }
}

function compactStateLabel(
  t: ReturnType<typeof useTranslations>,
  state?: AgentThreadState,
): string {
  switch (state) {
    case AgentThreadState.QUEUED: return t('Queued');
    case AgentThreadState.PROCESSING: return t('Processing');
    case AgentThreadState.COMPLETED: return t('Completed');
    case AgentThreadState.FAILED: return t('Failed');
    case AgentThreadState.TERMINATED: return t('Terminated');
    case AgentThreadState.GUARDRAIL_TRIGGER: return t('Guardrail Triggered');
    case AgentThreadState.PAUSED: return t('Paused');
    case AgentThreadState.PAUSED_FOR_APPROVAL: return t('Waiting for approval');
    case AgentThreadState.APPROVAL_REJECTED: return t('Approval rejected');
    case AgentThreadState.WAITING_FOR_RESPONSE: return t('Waiting for response');
    case AgentThreadState.PAUSED_FOR_RESUME: return t('Resume scheduled');
    case AgentThreadState.HANDED_OFF: return t('Handed off');
    case AgentThreadState.LIMIT_EXCEEDED: return t('Limit exceeded');
    default: return t('Starting...');
  }
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

function CompactChevronIcon(): JSX.Element {
  return (
    <svg className="devic-handoff-compact-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

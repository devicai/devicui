import React, { useMemo, useState } from 'react';
import type {
  ChatMessage,
  HandOffToolResponse,
  SubagentMessageMetadata,
} from '../../api/types';
import { avatarUri, type AvatarStyle } from '../../utils/avatar';
import { useTranslations } from '../../i18n';

export type SubagentActivityStatus = 'running' | 'completed' | 'failed';

export interface SubagentActivity {
  threadId: string;
  toolCallId?: string;
  agentId?: string;
  agentName?: string;
  agentImgUrl?: string;
  agentAvatarStyle?: AvatarStyle | string;
  status: SubagentActivityStatus;
  launchIndex: number;
  resultIndex?: number;
}

export interface SubagentActivityTrayProps {
  /** Conversation messages containing async handoff acknowledgements/results. */
  messages: ChatMessage[];
  /** Show the dismiss button. A new subagent makes a dismissed tray visible again. */
  closable?: boolean;
  /** Called after the user dismisses the current group. */
  onClose?: () => void;
  className?: string;
}

type ResultEntry = {
  subagent?: SubagentMessageMetadata;
  status?: unknown;
};

const FAILED_STATES = new Set([
  'failed',
  'terminated',
  'error',
  'approval_rejected',
  'guardrail_trigger',
  'limit_exceeded',
]);

function handoffResponse(message: ChatMessage): HandOffToolResponse | null {
  const content = message.content?.data ?? message.content;
  return content && typeof content === 'object'
    ? content as HandOffToolResponse
    : null;
}

function resultEntries(message: ChatMessage): ResultEntry[] {
  const data = message.content?.data;
  if (Array.isArray(data?.subagentResults)) {
    return data.subagentResults as ResultEntry[];
  }
  return [{ subagent: message.subagent, status: data?.status }];
}

function resultStatus(status: unknown): SubagentActivityStatus {
  return FAILED_STATES.has(String(status ?? '').toLowerCase())
    ? 'failed'
    : 'completed';
}

/**
 * Build the compact, durable view from the parent conversation itself.
 *
 * The detailed timeline widgets already follow each child thread over SSE.
 * Reusing the handoff acknowledgement and the synthetic result here avoids a
 * second stream per child while still updating through the parent's chat SSE.
 */
export function collectSubagentActivities(messages: ChatMessage[]): SubagentActivity[] {
  const toolResponses = new Map<string, ChatMessage>();
  let lastHumanUserIndex = -1;

  messages.forEach((message, index) => {
    if (message.role === 'tool' && message.tool_call_id) {
      toolResponses.set(message.tool_call_id, message);
    }
    if (message.role === 'user' && !(message.synthetic && message.source === 'subagent')) {
      lastHumanUserIndex = index;
    }
  });

  const byThread = new Map<string, SubagentActivity>();

  messages.forEach((message, index) => {
    for (const call of message.tool_calls ?? []) {
      if (call.function?.name !== 'hand_off_subagent') continue;
      const responseMessage = toolResponses.get(call.id);
      const response = responseMessage ? handoffResponse(responseMessage) : null;
      const threadId = response?.subThreadId ?? response?.subthreadId;
      const isAsync = response?.asynchronous === true
        || response?.executionMode === 'async'
        || response?.handedOff === false;
      if (!threadId || !isAsync) continue;

      byThread.set(threadId, {
        threadId,
        toolCallId: call.id,
        agentId: response?.agent?.id,
        agentName: response?.agent?.name,
        agentImgUrl: response?.agent?.imgUrl,
        agentAvatarStyle: response?.agent?.avatarStyle,
        status: 'running',
        launchIndex: index,
      });
    }

    if (!(message.synthetic && message.source === 'subagent')) return;
    for (const entry of resultEntries(message)) {
      const metadata = entry.subagent ?? message.subagent;
      if (!metadata?.threadId) continue;
      const current = byThread.get(metadata.threadId);
      byThread.set(metadata.threadId, {
        threadId: metadata.threadId,
        toolCallId: metadata.parentToolCallId ?? current?.toolCallId,
        agentId: metadata.agentId ?? current?.agentId,
        agentName: metadata.agentName ?? current?.agentName,
        agentImgUrl: metadata.agentImgUrl ?? current?.agentImgUrl,
        agentAvatarStyle: metadata.agentAvatarStyle ?? current?.agentAvatarStyle,
        status: resultStatus(entry.status),
        launchIndex: current?.launchIndex ?? index,
        resultIndex: index,
      });
    }
  });

  return [...byThread.values()]
    .filter((activity) =>
      activity.status === 'running'
      || activity.launchIndex >= lastHumanUserIndex
      || (activity.resultIndex ?? -1) >= lastHumanUserIndex)
    .sort((a, b) => {
      const statusOrder = Number(b.status === 'running') - Number(a.status === 'running');
      return statusOrder || a.launchIndex - b.launchIndex;
    });
}

function ActivityIcon({ activity }: { activity: SubagentActivity }): JSX.Element {
  if (activity.agentImgUrl || activity.agentId) {
    return (
      <img
        className="devic-subagent-activity-avatar-img"
        src={activity.agentImgUrl || avatarUri(activity.agentId!, activity.agentAvatarStyle as any)}
        alt=""
      />
    );
  }
  return <span aria-hidden="true">↳</span>;
}

function CloseIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function BranchIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="5" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M8 5h3a3 3 0 0 1 3 3v7a3 3 0 0 0 3 3M14 9a3 3 0 0 1 3-3" />
    </svg>
  );
}

export function SubagentActivityTray({
  messages,
  closable = true,
  onClose,
  className,
}: SubagentActivityTrayProps): JSX.Element | null {
  const t = useTranslations();
  const activities = useMemo(() => collectSubagentActivities(messages), [messages]);
  const signature = activities.map((activity) => activity.threadId).join('|');
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null);

  if (!activities.length || dismissedSignature === signature) return null;

  const running = activities.filter((activity) => activity.status === 'running').length;
  const failed = activities.filter((activity) => activity.status === 'failed').length;
  const title = activities.length === 1
    ? t('1 subagent')
    : t('{count} subagents', { count: activities.length });
  const summary = running > 0
    ? running === 1
      ? t('1 running')
      : t('{count} running', { count: running })
    : failed > 0
      ? failed === 1
        ? t('1 failed')
        : t('{count} failed', { count: failed })
      : t('All completed');

  return (
    <section
      className={`devic-subagent-activity${className ? ` ${className}` : ''}`}
      aria-label={t('Subagent activity')}
    >
      <header className="devic-subagent-activity-header">
        <span className="devic-subagent-activity-branch"><BranchIcon /></span>
        <strong>{title}</strong>
        <span className="devic-subagent-activity-summary">{summary}</span>
        {closable && (
          <button
            type="button"
            className="devic-subagent-activity-close"
            aria-label={t('Dismiss subagent activity')}
            title={t('Dismiss subagent activity')}
            onClick={() => {
              setDismissedSignature(signature);
              onClose?.();
            }}
          >
            <CloseIcon />
          </button>
        )}
      </header>
      <div className="devic-subagent-activity-list">
        {activities.map((activity) => (
          <div
            className="devic-subagent-activity-item"
            data-status={activity.status}
            data-thread-id={activity.threadId}
            key={activity.threadId}
          >
            <span className="devic-subagent-activity-avatar">
              <ActivityIcon activity={activity} />
            </span>
            <span className="devic-subagent-activity-name">
              {activity.agentName || t('Subagent')}
            </span>
            <span className="devic-subagent-activity-state">
              <i aria-hidden="true" />
              {activity.status === 'running'
                ? t('Running')
                : activity.status === 'failed'
                  ? t('Failed')
                  : t('Completed')}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

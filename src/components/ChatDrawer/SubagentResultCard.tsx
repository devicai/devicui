import React from 'react';
import Markdown from 'markdown-to-jsx';
import type { ChatMessage, SubagentMessageMetadata } from '../../api/types';
import { avatarUri } from '../../utils/avatar';
import { useTranslations } from '../../i18n';

export interface SubagentResultCardProps {
  message: ChatMessage;
}

type ResultEntry = {
  subagent?: SubagentMessageMetadata;
  status?: string;
  result?: unknown;
  error?: unknown;
};

function resultText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.message === 'string') return record.message;
    if (typeof record.response === 'string') return record.response;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return value == null ? '' : String(value);
}

function entriesFor(message: ChatMessage): ResultEntry[] {
  const data = message.content?.data;
  if (Array.isArray(data?.subagentResults)) return data.subagentResults;
  return [{
    subagent: message.subagent,
    status: data?.status,
    result: data?.result,
    error: data?.error,
  }];
}

export function SubagentResultCard({ message }: SubagentResultCardProps): JSX.Element {
  const t = useTranslations();
  return (
    <div className="devic-subagent-results" data-event-type={message.eventType}>
      {entriesFor(message).map((entry, index) => {
        const agent = entry.subagent;
        const failed = ['failed', 'terminated', 'error'].includes(
          String(entry.status || '').toLowerCase(),
        );
        const content = resultText(entry.error ?? entry.result ?? message.content?.message);
        return (
          <article
            className="devic-subagent-result"
            data-status={failed ? 'error' : 'completed'}
            data-thread-id={agent?.threadId}
            key={agent?.threadId || index}
          >
            <header className="devic-subagent-result-header">
              <span className="devic-handoff-agent-avatar">
                {agent?.agentImgUrl || agent?.agentId ? (
                  <img
                    className="devic-handoff-avatar-img"
                    src={agent.agentImgUrl || avatarUri(agent.agentId!, agent.agentAvatarStyle as any)}
                    alt=""
                  />
                ) : (
                  <span aria-hidden="true">↳</span>
                )}
              </span>
              <span className="devic-subagent-result-title">
                {agent?.agentName || t('Subagent')}
              </span>
              <span className="devic-subagent-result-status">
                {failed ? t('Failed') : t('Completed')}
              </span>
            </header>
            {content && (
              <div className="devic-subagent-result-body">
                <Markdown>{content}</Markdown>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

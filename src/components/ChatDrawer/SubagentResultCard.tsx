import React from 'react';
import Markdown from 'markdown-to-jsx';
import type { ChatMessage, SubagentMessageMetadata } from '../../api/types';
import { avatarUri } from '../../utils/avatar';
import { useTranslations } from '../../i18n';

export type SubagentResultCardProps =
  | { message: ChatMessage; messages?: ChatMessage[] }
  | { message?: ChatMessage; messages: ChatMessage[] };

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

function resultPreview(content: string, maxLength = 140): string {
  const plainText = content
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plainText.length <= maxLength) return plainText;
  return `${plainText.slice(0, maxLength).trimEnd()}…`;
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

export function SubagentResultCard({ message, messages }: SubagentResultCardProps): JSX.Element | null {
  const t = useTranslations();
  const sourceMessages = messages?.length ? messages : message ? [message] : [];
  const primaryMessage = message ?? sourceMessages[0];
  if (!primaryMessage) return null;
  const entries = sourceMessages.flatMap((sourceMessage) =>
    entriesFor(sourceMessage).map((entry) => ({ entry, sourceMessage })),
  );
  return (
    <div
      className="devic-subagent-results"
      data-event-type={primaryMessage.eventType}
      data-message-count={sourceMessages.length}
      data-result-count={entries.length}
      data-stacked={entries.length > 1 ? 'true' : 'false'}
    >
      {entries.map(({ entry, sourceMessage }, index) => {
        const agent = entry.subagent;
        const failed = ['failed', 'terminated', 'error'].includes(
          String(entry.status || '').toLowerCase(),
        );
        const content = resultText(entry.error ?? entry.result ?? sourceMessage.content?.message);
        const preview = resultPreview(content);
        return (
          <details
            className="devic-subagent-result"
            data-status={failed ? 'error' : 'completed'}
            data-thread-id={agent?.threadId}
            key={agent?.threadId || index}
          >
            <summary
              className="devic-subagent-result-summary"
              title={t('Show full subagent result')}
            >
              <span className="devic-subagent-result-header">
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
                <span className="devic-subagent-result-chevron" aria-hidden="true">⌄</span>
              </span>
              {preview && <span className="devic-subagent-result-preview">{preview}</span>}
            </summary>
            {content && (
              <div className="devic-subagent-result-body">
                <Markdown>{content}</Markdown>
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
}

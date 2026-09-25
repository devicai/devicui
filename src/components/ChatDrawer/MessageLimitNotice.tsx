import React from 'react';
import type { ReactNode } from 'react';
import { useTranslations } from '../../i18n';

export interface MessageLimitNoticeProps {
  /** Starts a fresh conversation with the same assistant. */
  onNewChat: () => void;
}

export type MessageLimitRenderer = (props: MessageLimitNoticeProps) => ReactNode;

/** Conversation-level notice shown after the assistant's message cap is reached. */
export function MessageLimitNotice({ onNewChat }: MessageLimitNoticeProps): JSX.Element {
  const t = useTranslations();
  return (
    <div className="devic-message-limit-notice" role="status">
      <strong>{t('Message limit reached for this chat')}</strong>
      <span>{t('This conversation has reached its message limit. Start a new chat to continue.')}</span>
      <button type="button" onClick={onNewChat}>
        {t('Start a new chat')}
      </button>
    </div>
  );
}

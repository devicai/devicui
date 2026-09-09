import React from 'react';
import type { QueueDisposition } from '../../api/types';
import { useTranslations } from '../../i18n';
import type { Translator } from '../../i18n';

export interface QueueNoticeProps {
  /** How many messages are waiting on this conversation right now. */
  queuedCount: number;
  /** What the last accepted message was told. Shapes the wording. */
  willProcess?: QueueDisposition;
  /**
   * Something happened to a message that the count alone does not explain — it
   * was turned down, or a stop threw it away. Replaces the standing text while
   * it is set, since it is the more urgent of the two.
   */
  alert?: string;
}

/**
 * The line above the input that says what happens to a message written while
 * the assistant is working.
 *
 * Writing into a conversation that is busy is allowed but not obvious, so it is
 * spelled out twice: before sending, what the button will do; after, what became
 * of it. Suppress it with `options.hideQueueNotice`, or replace it with
 * `options.queueNoticeRenderer`.
 */
export function QueueNotice({
  queuedCount,
  willProcess,
  alert,
}: QueueNoticeProps): JSX.Element {
  const t = useTranslations();
  return (
    <div
      className="devic-queue-notice"
      data-alert={alert ? 'true' : undefined}
      role={alert ? 'alert' : 'status'}
    >
      <span className="devic-queue-notice-icon" aria-hidden="true">
        {alert ? <WarningIcon /> : <ClockIcon />}
      </span>
      <span>{alert || noticeText(t, queuedCount, willProcess)}</span>
    </div>
  );
}

/**
 * Three different promises, so three different sentences.
 *
 * `after_delay` is the one that is easy to get wrong: an assistant with an input
 * delay queues what is written while the conversation is *idle*, waiting for the
 * sender to finish. Telling that person the assistant will pick it up "on its
 * next turn" describes a turn that is not happening.
 */
function noticeText(
  t: Translator,
  queuedCount: number,
  willProcess?: QueueDisposition
): string {
  if (queuedCount <= 0) {
    return t(
      'The assistant is still answering. Send anyway and your message joins its next turn.'
    );
  }

  // Singular and plural are separate entries rather than a placeholder over a
  // suffix: the two differ by more than an "s" in most languages.
  const one = queuedCount === 1;

  if (willProcess === 'after_delay') {
    return one
      ? t(
          '1 message waiting — the assistant is giving you a moment to finish before it answers.'
        )
      : t(
          '{count} messages waiting — the assistant is giving you a moment to finish before it answers.',
          { count: queuedCount }
        );
  }
  if (willProcess === 'on_resume') {
    return one
      ? t(
          '1 message waiting — the assistant picks it up when it comes back to this conversation.'
        )
      : t(
          '{count} messages waiting — the assistant picks them up when it comes back to this conversation.',
          { count: queuedCount }
        );
  }
  return one
    ? t('1 message waiting — the assistant picks it up on its next turn.')
    : t('{count} messages waiting — the assistant picks them up on its next turn.', {
        count: queuedCount,
      });
}

function WarningIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ClockIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

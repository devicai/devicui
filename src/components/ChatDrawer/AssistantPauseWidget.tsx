import React from 'react';
import type { ResumePausedChatResponse } from '../../api/types';
import { useTranslations } from '../../i18n';

export interface AssistantPauseWidgetProps {
  /** Epoch milliseconds of the original automatic resume deadline. */
  pausedUntil?: number | null;
  /** Optional explanation supplied by the assistant when it paused. */
  pausedReason?: string | null;
  /** Claim the pause and continue the same assistant turn immediately. */
  resumeNow: () => Promise<ResumePausedChatResponse>;
  /** True while the early-resume request is being claimed. */
  isResuming: boolean;
  /** Error from the last early-resume attempt. */
  error?: Error | null;
  className?: string;
}

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 7.5v5l3.2 1.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/** Default timed-pause card used by ChatDrawer and exportable on its own. */
export function AssistantPauseWidget({
  pausedUntil,
  pausedReason,
  resumeNow,
  isResuming,
  error,
  className = '',
}: AssistantPauseWidgetProps): JSX.Element {
  const t = useTranslations();
  const deadline = pausedUntil
    ? new Date(pausedUntil).toLocaleString()
    : undefined;

  return (
    <div className={`devic-assistant-pause ${className}`.trim()} role="status">
      <span className="devic-assistant-pause-icon"><ClockIcon /></span>
      <div className="devic-assistant-pause-copy">
        <strong>
          {deadline
            ? t('Paused until {when}', { when: deadline })
            : t('Assistant paused')}
        </strong>
        {pausedReason ? <span>{pausedReason}</span> : null}
        {error ? (
          <span className="devic-assistant-pause-error" role="alert">
            {t('Could not resume the assistant. Try again.')}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        className="devic-assistant-pause-resume"
        disabled={isResuming}
        onClick={() => void resumeNow().catch(() => undefined)}
      >
        {isResuming ? t('Resuming…') : t('Resume now')}
      </button>
    </div>
  );
}

import React, { useState, useCallback, useMemo } from 'react';
import { FeedbackModal } from './FeedbackModal';
import type { MessageActionsProps, FeedbackState } from './Feedback.types';

/**
 * Action buttons for a message (copy, thumbs up, thumbs down)
 */
export function MessageActions({
  messageId,
  messageContent,
  currentFeedback = 'none',
  onFeedback,
  onCopy,
  showCopy = true,
  showFeedback = true,
  disabled = false,
  theme,
}: MessageActionsProps): JSX.Element {
  const [feedbackState, setFeedbackState] = useState<FeedbackState>(currentFeedback);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingFeedbackType, setPendingFeedbackType] = useState<'positive' | 'negative'>('positive');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Build inline styles from theme for the actions container
  const containerStyle = useMemo(() => {
    if (!theme) return undefined;
    return {
      '--devic-bg-secondary': theme.secondaryBackgroundColor,
      '--devic-text-secondary': theme.textMutedColor,
    } as React.CSSProperties;
  }, [theme]);

  const handleCopy = useCallback(async () => {
    if (!messageContent) return;

    try {
      await navigator.clipboard.writeText(messageContent);
      setCopied(true);
      onCopy?.(messageContent);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [messageContent, onCopy]);

  const handleFeedbackClick = useCallback((type: 'positive' | 'negative') => {
    // If clicking the same feedback type that's already selected, toggle it off
    if ((type === 'positive' && feedbackState === 'positive') ||
        (type === 'negative' && feedbackState === 'negative')) {
      // Optionally could allow removal - for now we just open modal to change comment
    }

    setPendingFeedbackType(type);
    setModalOpen(true);
  }, [feedbackState]);

  const handleModalSubmit = useCallback(async (comment: string) => {
    setIsSubmitting(true);
    try {
      const isPositive = pendingFeedbackType === 'positive';
      await onFeedback?.(messageId, isPositive, comment || undefined);
      setFeedbackState(isPositive ? 'positive' : 'negative');
      setModalOpen(false);
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [messageId, pendingFeedbackType, onFeedback]);

  return (
    <>
      <div className="devic-message-actions" style={containerStyle}>
        {showCopy && messageContent && (
          <button
            type="button"
            className={`devic-action-btn ${copied ? 'devic-action-btn--active' : ''}`}
            onClick={handleCopy}
            disabled={disabled}
            title="Copy to clipboard"
            aria-label="Copy to clipboard"
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        )}

        {showFeedback && (
          <>
            <button
              type="button"
              className={`devic-action-btn ${feedbackState === 'positive' ? 'devic-action-btn--active devic-action-btn--positive' : ''}`}
              onClick={() => handleFeedbackClick('positive')}
              disabled={disabled}
              title="Good response"
              aria-label="Good response"
            >
              <ThumbsUpIcon filled={feedbackState === 'positive'} />
            </button>

            <button
              type="button"
              className={`devic-action-btn ${feedbackState === 'negative' ? 'devic-action-btn--active devic-action-btn--negative' : ''}`}
              onClick={() => handleFeedbackClick('negative')}
              disabled={disabled}
              title="Bad response"
              aria-label="Bad response"
            >
              <ThumbsDownIcon filled={feedbackState === 'negative'} />
            </button>
          </>
        )}
      </div>

      <FeedbackModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleModalSubmit}
        feedbackType={pendingFeedbackType}
        isSubmitting={isSubmitting}
        theme={theme}
      />
    </>
  );
}

/* ── Icons ── */

function CopyIcon(): JSX.Element {
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
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20,6 9,17 4,12" />
    </svg>
  );
}

function ThumbsUpIcon({ filled = false }: { filled?: boolean }): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

function ThumbsDownIcon({ filled = false }: { filled?: boolean }): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}

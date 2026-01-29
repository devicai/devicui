import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { FeedbackModalProps } from './Feedback.types';

/**
 * Modal for submitting feedback with optional comment
 */
export function FeedbackModal({
  isOpen,
  onClose,
  onSubmit,
  feedbackType,
  isSubmitting = false,
  theme,
}: FeedbackModalProps): JSX.Element | null {
  const [comment, setComment] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Build inline styles from theme
  const modalStyle = useMemo(() => {
    if (!theme) return undefined;
    return {
      '--devic-bg': theme.backgroundColor,
      '--devic-text': theme.textColor,
      '--devic-text-muted': theme.textMutedColor,
      '--devic-text-secondary': theme.textMutedColor,
      '--devic-bg-secondary': theme.secondaryBackgroundColor,
      '--devic-border': theme.borderColor,
      '--devic-primary': theme.primaryColor,
      '--devic-primary-hover': theme.primaryHoverColor,
    } as React.CSSProperties;
  }, [theme]);

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Reset comment when modal closes
  useEffect(() => {
    if (!isOpen) {
      setComment('');
    }
  }, [isOpen]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(comment);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmit(comment);
    }
  };

  return (
    <div className="devic-feedback-overlay">
      <div className="devic-feedback-modal" ref={modalRef} style={modalStyle}>
        <div className="devic-feedback-modal-header">
          <span className="devic-feedback-modal-icon">
            {feedbackType === 'positive' ? <ThumbsUpIcon filled /> : <ThumbsDownIcon filled />}
          </span>
          <span className="devic-feedback-modal-title">
            {feedbackType === 'positive' ? 'What did you like?' : 'What could be improved?'}
          </span>
          <button
            type="button"
            className="devic-feedback-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            className="devic-feedback-textarea"
            placeholder="Add a comment (optional)..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            disabled={isSubmitting}
          />

          <div className="devic-feedback-modal-actions">
            <button
              type="button"
              className="devic-feedback-btn devic-feedback-btn--secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="devic-feedback-btn devic-feedback-btn--primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Icons ── */

function ThumbsUpIcon({ filled = false }: { filled?: boolean }): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
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
      width="16"
      height="16"
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

function CloseIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

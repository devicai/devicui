import type { FeedbackEntry } from '../../api/types';

/**
 * Feedback state for a message
 */
export type FeedbackState = 'none' | 'positive' | 'negative';

/**
 * Theme configuration for feedback components
 */
export interface FeedbackTheme {
  backgroundColor?: string;
  textColor?: string;
  textMutedColor?: string;
  secondaryBackgroundColor?: string;
  borderColor?: string;
  primaryColor?: string;
  primaryHoverColor?: string;
}

/**
 * Props for FeedbackModal component
 */
export interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => void;
  feedbackType: 'positive' | 'negative';
  isSubmitting?: boolean;
  theme?: FeedbackTheme;
}

/**
 * Props for MessageActions component
 */
export interface MessageActionsProps {
  messageId: string;
  messageContent?: string;
  currentFeedback?: FeedbackState;
  onFeedback?: (messageId: string, positive: boolean, comment?: string) => void;
  onCopy?: (content: string) => void;
  showCopy?: boolean;
  showFeedback?: boolean;
  disabled?: boolean;
  theme?: FeedbackTheme;
}

/**
 * Context value for feedback
 */
export interface FeedbackContextValue {
  feedbackMap: Map<string, FeedbackEntry>;
  submitFeedback: (messageId: string, positive: boolean, comment?: string) => Promise<void>;
  isSubmitting: boolean;
}

import type { AgentThreadState } from '../../api/types';

export interface ThreadStateTagProps {
  /**
   * Current thread state
   */
  state: AgentThreadState | string;

  /**
   * Thread ID
   */
  threadId: string;

  /**
   * Agent name for display in modals
   */
  agentName: string;

  /**
   * Show icon next to the state text
   * @default true
   */
  showIcon?: boolean;

  /**
   * Custom icon to replace the default state icon
   */
  customIcon?: React.ReactNode;

  /**
   * Reason for pause (used in tooltip)
   */
  pausedReason?: string;

  /**
   * Message shown when approval was rejected
   */
  approvalRejectedMessage?: string;

  /**
   * Reason the thread finished
   */
  finishReason?: string;

  /**
   * Callback after an action is completed (pause, resume, approve, etc.)
   */
  onActionComplete?: (info?: 'WAITING_FOR_RESPONSE_EXPIRED') => void;

  /**
   * Timestamp until which thread is paused
   */
  pauseUntil?: number;

  /**
   * Number of parallel subthreads (displayed in handed_off state)
   */
  subthreadCount?: number;

  /**
   * Whether to show admin-only actions (complete manually)
   * @default false
   */
  showAdminActions?: boolean;

  /**
   * API key for thread actions (explain, pause/resume, approve)
   * Falls back to DevicProvider context
   */
  apiKey?: string;

  /**
   * Base URL for API calls
   * Falls back to DevicProvider context
   */
  baseUrl?: string;

  /**
   * Whether the dropdown is interactive (clickable).
   * When false, the tag is display-only.
   * @default true
   */
  interactive?: boolean;
}

export interface StateConfig {
  color: string;
  bgColor: string;
  borderColor: string;
  text: string;
  iconType: string | null;
}

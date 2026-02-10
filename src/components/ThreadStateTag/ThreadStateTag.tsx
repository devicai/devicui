import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useOptionalDevicContext } from '../../provider';
import { DevicApiClient } from '../../api/client';
import { AgentThreadState } from '../../api/types';
import type { ThreadStateTagProps, StateConfig } from './ThreadStateTag.types';
import './ThreadStateTag.css';

/* ── State configuration map ── */

function getStateConfig(state: string, subthreadCount?: number): StateConfig {
  const configs: Record<string, StateConfig> = {
    [AgentThreadState.QUEUED]: {
      color: 'gold', bgColor: '#fffbe6', borderColor: '#ffe58f',
      text: 'Queued', iconType: null,
    },
    [AgentThreadState.PROCESSING]: {
      color: 'processing', bgColor: '#e6f4ff', borderColor: '#91caff',
      text: 'Processing', iconType: 'spinner',
    },
    [AgentThreadState.COMPLETED]: {
      color: 'success', bgColor: '#f6ffed', borderColor: '#b7eb8f',
      text: 'Completed', iconType: null,
    },
    [AgentThreadState.FAILED]: {
      color: 'error', bgColor: '#fff2f0', borderColor: '#ffa39e',
      text: 'Failed', iconType: null,
    },
    [AgentThreadState.TERMINATED]: {
      color: 'default', bgColor: '#fafafa', borderColor: '#d9d9d9',
      text: 'Terminated', iconType: null,
    },
    [AgentThreadState.GUARDRAIL_TRIGGER]: {
      color: 'error', bgColor: '#fff2f0', borderColor: '#ffa39e',
      text: 'Guardrail Triggered', iconType: 'shield',
    },
    [AgentThreadState.PAUSED]: {
      color: 'purple', bgColor: '#f9f0ff', borderColor: '#d3adf7',
      text: 'Paused', iconType: 'pause',
    },
    [AgentThreadState.PAUSED_FOR_APPROVAL]: {
      color: 'gold', bgColor: '#fffbe6', borderColor: '#ffe58f',
      text: 'Waiting for approval', iconType: 'warning',
    },
    [AgentThreadState.APPROVAL_REJECTED]: {
      color: 'error', bgColor: '#fff2f0', borderColor: '#ffa39e',
      text: 'Approval rejected', iconType: null,
    },
    [AgentThreadState.WAITING_FOR_RESPONSE]: {
      color: 'gold', bgColor: '#fffbe6', borderColor: '#ffe58f',
      text: 'Waiting for response', iconType: 'envelope',
    },
    [AgentThreadState.PAUSED_FOR_RESUME]: {
      color: 'blue', bgColor: '#e6f4ff', borderColor: '#91caff',
      text: 'Resume scheduled', iconType: 'clock',
    },
    [AgentThreadState.HANDED_OFF]: {
      color: 'blue', bgColor: '#e6f4ff', borderColor: '#91caff',
      text: subthreadCount && subthreadCount > 1 ? `Handed off (${subthreadCount})` : 'Handed off',
      iconType: 'handoff',
    },
  };

  return configs[state] || { color: 'default', bgColor: '#fafafa', borderColor: '#d9d9d9', text: 'Unknown', iconType: null };
}

/* ── SVG Icons ── */

function SpinnerIcon(): JSX.Element {
  return (
    <svg className="devic-state-spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function PauseIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function PlayIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function WarningIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

function EnvelopeIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 7L2 7" />
    </svg>
  );
}

function ClockIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  );
}

function ShieldIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function HandoffIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm-1 6h2a3 3 0 0 1 3 3v3h-2v-3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3H8v-3a3 3 0 0 1 3-3z" />
      <path d="M16 16l4-2-4-2v4z" opacity="0.8" />
    </svg>
  );
}

function CaretDownIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="5 8 14 9" fill="currentColor">
      <path d="M7 10l5 5 5-5z" />
    </svg>
  );
}

function WrenchIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function EyeIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function LightbulbIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFC000" stroke="#FFC000" strokeWidth="1">
      <path d="M9 21h6M12 3a6 6 0 0 0-4 10.5V17h8v-3.5A6 6 0 0 0 12 3z" fill="#FFC000" stroke="none" />
    </svg>
  );
}

function RobotIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <circle cx="9" cy="14" r="2" fill="#fff" />
      <circle cx="15" cy="14" r="2" fill="#fff" />
      <line x1="12" y1="2" x2="12" y2="8" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="2" r="1.5" />
    </svg>
  );
}

function UserIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  );
}

function CloseIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function InfoIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
    </svg>
  );
}

/* ── Helper: render icon by type ── */

function StateIcon({ iconType }: { iconType: string | null }): JSX.Element | null {
  switch (iconType) {
    case 'spinner': return <SpinnerIcon />;
    case 'pause': return <PauseIcon />;
    case 'warning': return <WarningIcon />;
    case 'envelope': return <EnvelopeIcon />;
    case 'clock': return <ClockIcon />;
    case 'shield': return <ShieldIcon />;
    case 'handoff': return <HandoffIcon />;
    default: return null;
  }
}

/* ── Modal component ── */

function Modal({
  open,
  onClose,
  title,
  titleIcon,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  titleIcon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}): JSX.Element | null {
  if (!open) return null;

  return (
    <div className="devic-state-modal-overlay" onClick={onClose}>
      <div className="devic-state-modal" onClick={(e) => e.stopPropagation()}>
        <div className="devic-state-modal-header">
          <h3 className="devic-state-modal-title">
            {titleIcon}
            {title}
          </h3>
          <button className="devic-state-modal-close" onClick={onClose} type="button">
            <CloseIcon />
          </button>
        </div>
        <div className="devic-state-modal-body">
          {children}
        </div>
        {footer && (
          <div className="devic-state-modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Explain Modal with typing effect ── */

function ExplainModal({
  open,
  onClose,
  explanation,
  isLoading,
  agentName,
}: {
  open: boolean;
  onClose: () => void;
  explanation: string | null;
  isLoading: boolean;
  agentName: string;
}): JSX.Element | null {
  const [displayedText, setDisplayedText] = useState('');
  const [fullTextDisplayed, setFullTextDisplayed] = useState(false);
  const charIndexRef = useRef(0);

  useEffect(() => {
    if (!explanation || isLoading) {
      setDisplayedText('');
      charIndexRef.current = 0;
      setFullTextDisplayed(false);
      return;
    }

    if (charIndexRef.current < explanation.length) {
      const timer = setTimeout(() => {
        charIndexRef.current++;
        setDisplayedText(explanation.slice(0, charIndexRef.current));
        if (charIndexRef.current >= explanation.length) {
          setFullTextDisplayed(true);
        }
      }, 20);
      return () => clearTimeout(timer);
    }
  }, [explanation, isLoading, displayedText]);

  const handleClose = () => {
    setDisplayedText('');
    charIndexRef.current = 0;
    setFullTextDisplayed(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Thread execution description of "${agentName}"`}
      titleIcon={<LightbulbIcon />}
    >
      {isLoading ? (
        <div className="devic-state-loading">
          <div className="devic-state-loading-spinner" />
        </div>
      ) : (
        <div className="devic-explain-content">
          {displayedText}
          {!fullTextDisplayed && <span className="devic-typing-cursor">|</span>}
        </div>
      )}
    </Modal>
  );
}

/* ── Approval Modal ── */

function ApprovalModal({
  open,
  onClose,
  onApprove,
  isLoading,
  pausedReason,
}: {
  open: boolean;
  onClose: () => void;
  onApprove: (action: 'approved' | 'rejected', retry: boolean, message?: string) => void;
  isLoading: boolean;
  pausedReason?: string;
}): JSX.Element | null {
  const [feedback, setFeedback] = useState('');

  const handleClose = () => {
    setFeedback('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Review Agent Request"
      titleIcon={<EyeIcon />}
    >
      <div className="devic-approval-layout">
        <div className="devic-approval-request">
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Agent's request:</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{pausedReason || 'Agent is waiting for approval to resume execution.'}</div>
        </div>
        <div className="devic-approval-actions">
          <div style={{ fontWeight: 600, fontSize: 13 }}>Your feedback:</div>
          <textarea
            className="devic-approval-textarea"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Optional feedback for the agent..."
          />
          <div className="devic-approval-buttons">
            <button
              className="devic-state-btn devic-state-btn-danger"
              onClick={() => onApprove('rejected', false, feedback)}
              disabled={isLoading}
              type="button"
            >
              Reject and finish
            </button>
            <button
              className="devic-state-btn devic-state-btn-primary"
              onClick={() => onApprove('rejected', true, feedback)}
              disabled={isLoading || !feedback.trim()}
              type="button"
            >
              Continue with feedback
            </button>
            <button
              className="devic-state-btn devic-state-btn-success"
              onClick={() => onApprove('approved', false)}
              disabled={isLoading}
              type="button"
            >
              Approve
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ── Complete Thread Modal ── */

function CompleteModal({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: (state: string) => void;
}): JSX.Element | null {
  const [completionState, setCompletionState] = useState('terminated');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Complete Execution Manually"
      titleIcon={<WrenchIcon />}
      footer={
        <>
          <button className="devic-state-btn" onClick={onClose} type="button">Cancel</button>
          <button className="devic-state-btn devic-state-btn-danger" onClick={() => onComplete(completionState)} type="button">
            Complete
          </button>
        </>
      }
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Confirm Manual Completion</div>
        <p style={{ margin: '4px 0 12px', color: '#666', fontSize: 13 }}>
          You are about to manually complete this agent's execution.
        </p>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 6, fontSize: 13 }}>Complete as:</div>
          <select
            className="devic-completion-select"
            value={completionState}
            onChange={(e) => setCompletionState(e.target.value)}
          >
            <option value="terminated">Terminated - Finish thread as manually terminated</option>
            <option value="completed">Completed - Finish thread as successfully completed</option>
            <option value="failed">Failed - Finish thread as failed or with errors</option>
          </select>
        </div>
        <div className="devic-state-warning">
          <InfoIcon />
          <span>This action will immediately terminate all ongoing processes. The execution cannot be resumed after completion.</span>
        </div>
      </div>
    </Modal>
  );
}

/* ── Confirm Modal (Pause/Resume) ── */

function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  icon,
  message,
  confirmText,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  icon: React.ReactNode;
  message: string;
  confirmText: string;
}): JSX.Element | null {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      titleIcon={icon}
      footer={
        <>
          <button className="devic-state-btn" onClick={onClose} type="button">Cancel</button>
          <button className="devic-state-btn devic-state-btn-primary" onClick={onConfirm} type="button">
            {confirmText}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, color: '#666', fontSize: 14 }}>{message}</p>
    </Modal>
  );
}

/* ── Main ThreadStateTag ── */

export function ThreadStateTag({
  state,
  threadId,
  agentName,
  showIcon = true,
  customIcon,
  pausedReason,
  approvalRejectedMessage,
  finishReason,
  onActionComplete,
  pauseUntil,
  subthreadCount,
  showAdminActions = false,
  apiKey,
  baseUrl,
  interactive = true,
}: ThreadStateTagProps): JSX.Element {
  const context = useOptionalDevicContext();
  const resolvedApiKey = apiKey || context?.apiKey;
  const resolvedBaseUrl = baseUrl || context?.baseUrl || 'https://api.devic.ai';

  // State
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [explainModalOpen, setExplainModalOpen] = useState(false);
  const [threadExplanation, setThreadExplanation] = useState<string | null>(null);
  const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [resumeModalOpen, setResumeModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [isLoadingApproval, setIsLoadingApproval] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);

  const tagRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  // Close dropdown on click outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        tagRef.current && !tagRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  // API client
  const getClient = useCallback((): DevicApiClient | null => {
    if (!resolvedApiKey) return null;
    return new DevicApiClient({ apiKey: resolvedApiKey, baseUrl: resolvedBaseUrl });
  }, [resolvedApiKey, resolvedBaseUrl]);

  // Config
  const config = getStateConfig(state, subthreadCount);

  if (!state) {
    return <span className="devic-state-tag" data-color="default">Unknown</span>;
  }

  // Icon
  const renderIcon = () => {
    if (!showIcon) return null;
    if (customIcon) return <span className="devic-state-tag-icon">{customIcon}</span>;
    const icon = <StateIcon iconType={config.iconType} />;
    return icon ? <span className="devic-state-tag-icon">{icon}</span> : null;
  };

  // Tooltip content
  const getTooltipContent = (): string | null => {
    switch (state) {
      case AgentThreadState.PAUSED_FOR_APPROVAL:
        return 'Agent is waiting for approval to resume execution';
      case AgentThreadState.PAUSED_FOR_RESUME:
        if (pauseUntil) {
          const timeDiff = new Date(pauseUntil).getTime() - Date.now();
          const hours = Math.floor(timeDiff / 3600000);
          const minutes = Math.floor(timeDiff / 60000);
          const timeStr = hours > 0 ? `${hours} hours` : `${minutes} minutes`;
          return `Agent paused, will resume at ${new Date(pauseUntil).toLocaleString()} (${timeStr})`;
        }
        return 'Agent paused, will resume at a scheduled time';
      case AgentThreadState.WAITING_FOR_RESPONSE:
        return pausedReason || 'Agent is waiting for response';
      case AgentThreadState.COMPLETED:
      case AgentThreadState.FAILED:
      case AgentThreadState.TERMINATED:
        return finishReason || 'Manually finished thread';
      case AgentThreadState.APPROVAL_REJECTED:
        return approvalRejectedMessage || 'Approval was rejected';
      case AgentThreadState.GUARDRAIL_TRIGGER:
        return 'Agent execution paused due to guardrail trigger';
      default:
        return null;
    }
  };

  // Handlers
  const handleExplain = async () => {
    setDropdownOpen(false);
    setExplainModalOpen(true);
    setIsLoadingExplanation(true);
    setThreadExplanation(null);

    const client = getClient();
    if (!client) {
      setThreadExplanation('API key not configured.');
      setIsLoadingExplanation(false);
      return;
    }

    try {
      const explanation = await client.explainAgentThread(threadId);
      setThreadExplanation(explanation);
    } catch {
      setThreadExplanation('Could not obtain the thread explanation.');
    } finally {
      setIsLoadingExplanation(false);
    }
  };

  const handlePause = async () => {
    const client = getClient();
    if (!client) return;
    try {
      await client.pauseResumeThread(threadId, 'paused');
      setPauseModalOpen(false);
      onActionComplete?.();
    } catch (err) {
      console.error('Error pausing thread:', err);
    }
  };

  const handleResume = async () => {
    const client = getClient();
    if (!client) return;
    try {
      await client.pauseResumeThread(threadId, 'queued');
      setResumeModalOpen(false);
      onActionComplete?.();
    } catch (err) {
      console.error('Error resuming thread:', err);
    }
  };

  const handleApproval = async (action: 'approved' | 'rejected', retry: boolean, message?: string) => {
    const client = getClient();
    if (!client) return;
    setIsLoadingApproval(true);
    try {
      await client.handleThreadApproval(threadId, action === 'approved', retry, message || '');
      setReviewModalOpen(false);
      onActionComplete?.();
    } catch (err) {
      console.error('Error handling thread approval:', err);
    } finally {
      setIsLoadingApproval(false);
    }
  };

  const handleComplete = async (completionState: string) => {
    const client = getClient();
    if (!client) return;
    try {
      await client.completeThread(threadId, completionState);
      setCompleteModalOpen(false);
      onActionComplete?.();
    } catch (err) {
      console.error('Error completing thread:', err);
    }
  };

  // Build dropdown items
  const dropdownItems: Array<{ key: string; icon: React.ReactNode; label: string; onClick: () => void }> = [];

  if (showAdminActions && [AgentThreadState.PROCESSING, AgentThreadState.QUEUED, AgentThreadState.WAITING_FOR_RESPONSE].includes(state as AgentThreadState)) {
    dropdownItems.push({
      key: 'complete',
      icon: <WrenchIcon />,
      label: 'Complete manually',
      onClick: () => { setDropdownOpen(false); setCompleteModalOpen(true); },
    });
  }

  if (state === AgentThreadState.QUEUED) {
    dropdownItems.push({
      key: 'pause',
      icon: <PauseIcon />,
      label: 'Pause',
      onClick: () => { setDropdownOpen(false); setPauseModalOpen(true); },
    });
  }

  if (state === AgentThreadState.PAUSED || state === AgentThreadState.PAUSED_FOR_RESUME) {
    dropdownItems.push({
      key: 'resume',
      icon: <PlayIcon />,
      label: 'Resume',
      onClick: () => { setDropdownOpen(false); setResumeModalOpen(true); },
    });
  }

  if (state === AgentThreadState.PAUSED_FOR_APPROVAL) {
    dropdownItems.push({
      key: 'review',
      icon: <EyeIcon />,
      label: 'Review',
      onClick: () => { setDropdownOpen(false); setReviewModalOpen(true); },
    });
  }

  dropdownItems.push({
    key: 'explain',
    icon: <LightbulbIcon />,
    label: 'Explain thread...',
    onClick: handleExplain,
  });

  const canInteract = interactive && threadId;
  const tooltipContent = getTooltipContent();

  return (
    <>
      <div
        ref={tagRef}
        className="devic-state-tag"
        data-color={config.color}
        data-interactive={String(!!canInteract)}
        data-dropdown-open={String(dropdownOpen)}
        onClick={canInteract ? () => {
          if (!dropdownOpen) {
            const rect = tagRef.current?.getBoundingClientRect();
            if (rect) {
              setDropdownStyle({
                position: 'fixed',
                top: rect.bottom + 4,
                right: window.innerWidth - rect.right,
              });
            }
          }
          setDropdownOpen(!dropdownOpen);
        } : undefined}
        onMouseEnter={() => {
          if (!dropdownOpen && tooltipContent) {
            const rect = tagRef.current?.getBoundingClientRect();
            if (rect) {
              setTooltipStyle({
                position: 'fixed',
                top: rect.top - 8,
                left: rect.left + rect.width / 2,
                transform: 'translate(-50%, -100%)',
              });
            }
            setShowTooltip(true);
          }
        }}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {renderIcon()}
        {config.text}
        {canInteract && (
          <span className="devic-state-tag-caret">
            <CaretDownIcon />
          </span>
        )}

      </div>

      {/* Tooltip - portal to escape overflow/transform containers */}
      {showTooltip && tooltipContent && !dropdownOpen && createPortal(
        <div className="devic-state-tooltip-portal" style={tooltipStyle}>{tooltipContent}</div>,
        document.body
      )}

      {/* Dropdown - portal to escape overflow/transform containers */}
      {dropdownOpen && canInteract && createPortal(
        <div ref={dropdownRef} className="devic-state-dropdown-portal" style={dropdownStyle}>
          {dropdownItems.map((item) => (
            <button
              key={item.key}
              className="devic-state-dropdown-item"
              onClick={(e) => { e.stopPropagation(); item.onClick(); }}
              type="button"
            >
              <span className="devic-state-dropdown-item-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}

      {/* Modals */}
      <ExplainModal
        open={explainModalOpen}
        onClose={() => setExplainModalOpen(false)}
        explanation={threadExplanation}
        isLoading={isLoadingExplanation}
        agentName={agentName}
      />

      <CompleteModal
        open={completeModalOpen}
        onClose={() => setCompleteModalOpen(false)}
        onComplete={handleComplete}
      />

      <ConfirmModal
        open={pauseModalOpen}
        onClose={() => setPauseModalOpen(false)}
        onConfirm={handlePause}
        title="Pause Thread"
        icon={<PauseIcon />}
        message="You are about to pause this queued thread. It can be resumed later."
        confirmText="Pause"
      />

      <ConfirmModal
        open={resumeModalOpen}
        onClose={() => setResumeModalOpen(false)}
        onConfirm={handleResume}
        title="Resume Thread"
        icon={<PlayIcon />}
        message="You are about to resume this thread. It will go back to the queue and be processed when possible."
        confirmText="Resume"
      />

      <ApprovalModal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        onApprove={handleApproval}
        isLoading={isLoadingApproval}
        pausedReason={pausedReason}
      />
    </>
  );
}

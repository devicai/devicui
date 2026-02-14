import React, { forwardRef, useImperativeHandle, useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAICommandBar, formatShortcut } from './useAICommandBar';
import { MessageActions } from '../Feedback';
import { useOptionalDevicContext } from '../../provider';
import { DevicApiClient } from '../../api/client';
import type { AICommandBarProps, AICommandBarHandle, AICommandBarOptions, ToolCallSummary } from './AICommandBar.types';
import type { ToolGroupCall } from '../../api/types';
import { segmentToolCalls } from '../../utils/toolGroups';
import type { FeedbackState, FeedbackTheme } from '../Feedback';
import './AICommandBar.css';
import '../Feedback/Feedback.css';

/**
 * Detect if a color is dark based on perceived brightness
 */
function isColorDark(color: string): boolean {
  // Handle hex colors
  const hex = color.replace('#', '');
  if (hex.length === 3 || hex.length === 6) {
    const r = parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.slice(0, 2), 16);
    const g = parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.slice(2, 4), 16);
    const b = parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.slice(4, 6), 16);
    // Perceived brightness formula
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  }
  // Handle rgb/rgba
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  }
  return false;
}

/**
 * Lighten or darken a hex color
 */
function adjustColor(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const r = Math.min(255, Math.max(0, parseInt(hex.slice(0, 2), 16) + amount));
  const g = Math.min(255, Math.max(0, parseInt(hex.slice(2, 4), 16) + amount));
  const b = Math.min(255, Math.max(0, parseInt(hex.slice(4, 6), 16) + amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const DEFAULT_OPTIONS: Required<AICommandBarOptions> = {
  position: 'inline',
  fixedPlacement: {},
  shortcut: '',
  showShortcutHint: true,
  placeholder: 'Ask AI...',
  icon: undefined as any,
  width: 400,
  maxWidth: '100%',
  zIndex: 9999,
  showResultCard: true,
  resultCardMaxHeight: 300,
  color: '#3b82f6',
  backgroundColor: '#ffffff',
  textColor: '#1f2937',
  borderColor: '#e5e7eb',
  borderRadius: 12,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontSize: 14,
  padding: '12px 16px',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
  animationDuration: 200,
  toolRenderers: undefined as any,
  toolIcons: undefined as any,
  processingMessage: 'Processing...',
  enableHistory: true,
  maxHistoryItems: 50,
  historyStorageKey: 'devic-command-bar-history',
  commands: undefined as any,
  showHistoryCommand: true,
  toolGroups: undefined as any,
};

/**
 * AI Command Bar component - a floating input for quick AI interactions
 *
 * @example
 * ```tsx
 * <AICommandBar
 *   assistantId="support-assistant"
 *   options={{
 *     position: 'fixed',
 *     fixedPlacement: { bottom: 20, right: 20 },
 *     shortcut: 'cmd+j',
 *     placeholder: 'Ask AI...',
 *   }}
 *   onResponse={({ message }) => console.log('Response:', message.content)}
 * />
 * ```
 */
export const AICommandBar = forwardRef<AICommandBarHandle, AICommandBarProps>(
  function AICommandBar(props, ref) {
    const {
      assistantId,
      apiKey,
      baseUrl,
      tenantId,
      tenantMetadata,
      options = {},
      isVisible: controlledVisible,
      onVisibilityChange,
      onExecute = 'callback',
      chatDrawerRef,
      onResponse,
      modelInterfaceTools,
      onSubmit,
      onToolCall,
      onError,
      onOpen,
      onClose,
      className,
    } = props;

    const mergedOptions = useMemo(
      () => ({ ...DEFAULT_OPTIONS, ...options }),
      [options]
    );

    const hook = useAICommandBar({
      assistantId,
      apiKey,
      baseUrl,
      tenantId,
      tenantMetadata,
      options: mergedOptions,
      isVisible: controlledVisible,
      onVisibilityChange,
      onExecute,
      chatDrawerRef,
      onResponse,
      modelInterfaceTools,
      onSubmit,
      onToolCall,
      onError,
      onOpen,
      onClose,
    });

    // Expose handle
    useImperativeHandle(ref, () => ({
      open: hook.open,
      close: hook.close,
      toggle: hook.toggle,
      focus: hook.focus,
      submit: hook.submit,
      reset: hook.reset,
    }));

    // Tool list expansion state
    const [toolsExpanded, setToolsExpanded] = useState(false);

    // Feedback state
    const [feedbackState, setFeedbackState] = useState<FeedbackState>('none');
    const feedbackClientRef = useRef<DevicApiClient | null>(null);

    // Get context for API client
    const context = useOptionalDevicContext();
    const resolvedApiKey = apiKey || context?.apiKey;
    const resolvedBaseUrl = baseUrl || context?.baseUrl || 'https://api.devic.ai';

    // Initialize feedback client
    useEffect(() => {
      if (resolvedApiKey && !feedbackClientRef.current) {
        feedbackClientRef.current = new DevicApiClient({
          apiKey: resolvedApiKey,
          baseUrl: resolvedBaseUrl,
        });
      }
    }, [resolvedApiKey, resolvedBaseUrl]);

    // Reset feedback state when result changes
    useEffect(() => {
      if (hook.result) {
        setFeedbackState('none');
      }
    }, [hook.result?.chatUid, hook.result?.message.uid]);

    // Handle feedback submission
    const handleFeedback = useCallback(
      async (messageId: string, positive: boolean, comment?: string) => {
        if (!hook.result?.chatUid || !feedbackClientRef.current) return;

        try {
          await feedbackClientRef.current.submitChatFeedback(assistantId, hook.result.chatUid, {
            messageId,
            feedback: positive,
            feedbackComment: comment,
          });

          setFeedbackState(positive ? 'positive' : 'negative');
        } catch (err) {
          console.error('Failed to submit feedback:', err);
          throw err;
        }
      },
      [hook.result?.chatUid, assistantId]
    );

    // Container ref for theming
    const containerRef = useRef<HTMLDivElement>(null);

    // Apply CSS variables for theming
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const vars: [string, string | undefined][] = [
        ['--devic-cmd-bg-override', mergedOptions.backgroundColor],
        ['--devic-cmd-text-override', mergedOptions.textColor],
        ['--devic-cmd-border-override', mergedOptions.borderColor],
        ['--devic-cmd-primary-override', mergedOptions.color],
        ['--devic-cmd-font-family-override', mergedOptions.fontFamily],
        ['--devic-cmd-font-size-override', typeof mergedOptions.fontSize === 'number' ? `${mergedOptions.fontSize}px` : mergedOptions.fontSize],
        ['--devic-cmd-radius-override', typeof mergedOptions.borderRadius === 'number' ? `${mergedOptions.borderRadius}px` : mergedOptions.borderRadius],
        ['--devic-cmd-shadow-override', mergedOptions.boxShadow],
        ['--devic-cmd-animation-duration-override', `${mergedOptions.animationDuration}ms`],
      ];

      for (const [name, value] of vars) {
        if (value) {
          el.style.setProperty(name, value);
        } else {
          el.style.removeProperty(name);
        }
      }
    }, [mergedOptions]);

    // Click-outside detection to close the bar
    useEffect(() => {
      if (!hook.isVisible) return;

      const handleClickOutside = (e: MouseEvent) => {
        const container = containerRef.current;
        if (container && !container.contains(e.target as Node)) {
          // Reset if there's a result, otherwise just close
          if (hook.result) {
            hook.reset();
          }
          hook.close();
        }
      };

      // Use mousedown instead of click to prevent race conditions
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [hook.isVisible, hook.result, hook.reset, hook.close]);

    // Feedback theme derived from command bar options
    const feedbackTheme = useMemo((): FeedbackTheme | undefined => {
      const bg = mergedOptions.backgroundColor;
      const text = mergedOptions.textColor;
      const border = mergedOptions.borderColor;
      const primary = mergedOptions.color;

      // Only create theme if we have some custom colors
      if (!bg && !text) return undefined;

      const isDark = bg ? isColorDark(bg) : false;

      return {
        backgroundColor: bg,
        textColor: text,
        textMutedColor: text && bg ? (isDark ? adjustColor(text, -60) : adjustColor(text, 60)) : undefined,
        secondaryBackgroundColor: bg ? (isDark ? adjustColor(bg, 20) : adjustColor(bg, -15)) : undefined,
        borderColor: border,
        primaryColor: primary,
        primaryHoverColor: primary ? (isDark ? adjustColor(primary, 20) : adjustColor(primary, -20)) : undefined,
      };
    }, [mergedOptions.backgroundColor, mergedOptions.textColor, mergedOptions.borderColor, mergedOptions.color]);

    // Container styles
    const containerStyle = useMemo(() => {
      const style: React.CSSProperties = {
        width: typeof mergedOptions.width === 'number' ? `${mergedOptions.width}px` : mergedOptions.width,
        maxWidth: typeof mergedOptions.maxWidth === 'number' ? `${mergedOptions.maxWidth}px` : mergedOptions.maxWidth,
        zIndex: mergedOptions.zIndex,
      };

      if (mergedOptions.position === 'fixed') {
        const { top, right, bottom, left } = mergedOptions.fixedPlacement || {};
        if (top !== undefined) style.top = typeof top === 'number' ? `${top}px` : top;
        if (right !== undefined) style.right = typeof right === 'number' ? `${right}px` : right;
        if (bottom !== undefined) style.bottom = typeof bottom === 'number' ? `${bottom}px` : bottom;
        if (left !== undefined) style.left = typeof left === 'number' ? `${left}px` : left;
      }

      return style;
    }, [mergedOptions]);

    // Bar padding style
    const barStyle = useMemo(() => {
      if (!mergedOptions.padding || mergedOptions.padding === DEFAULT_OPTIONS.padding) {
        return undefined;
      }
      return {
        padding: typeof mergedOptions.padding === 'number' ? `${mergedOptions.padding}px` : mergedOptions.padding,
      };
    }, [mergedOptions.padding]);

    // Result card max height style
    const resultMessageStyle = useMemo(() => {
      if (!mergedOptions.resultCardMaxHeight || mergedOptions.resultCardMaxHeight === DEFAULT_OPTIONS.resultCardMaxHeight) {
        return undefined;
      }
      return {
        maxHeight: typeof mergedOptions.resultCardMaxHeight === 'number'
          ? `${mergedOptions.resultCardMaxHeight}px`
          : mergedOptions.resultCardMaxHeight,
      };
    }, [mergedOptions.resultCardMaxHeight]);

    // Render tool call items with optional toolGroups segmentation
    const renderToolCallItems = (toolCalls: ToolCallSummary[], opts: Required<AICommandBarOptions>) => {
      if (opts.toolGroups && opts.toolGroups.length > 0) {
        const calls: ToolGroupCall[] = toolCalls.map((tc) => ({
          name: tc.name,
          input: tc.input,
          output: tc.output,
          toolCallId: tc.id,
        }));
        const segments = segmentToolCalls(calls, opts.toolGroups);
        const elements: React.ReactNode[] = [];
        let callIdx = 0;

        for (const segment of segments) {
          if (segment.type === 'group') {
            const groupKey = segment.calls.map((c) => c.toolCallId).join('-');
            elements.push(
              <div key={`cmd-group-${groupKey}`} className="devic-command-bar-result-tool-item devic-command-bar-result-tool-custom">
                {segment.config.renderer(segment.calls)}
              </div>,
            );
            callIdx += segment.calls.length;
          } else {
            const tc = toolCalls[callIdx];
            const customRenderer = opts.toolRenderers?.[tc.name];
            if (customRenderer) {
              elements.push(
                <div key={tc.id} className="devic-command-bar-result-tool-item devic-command-bar-result-tool-custom">
                  {customRenderer(tc.input, tc.output)}
                </div>,
              );
            } else {
              const customIcon = opts.toolIcons?.[tc.name];
              elements.push(
                <div key={tc.id} className="devic-command-bar-result-tool-item">
                  {customIcon ? (
                    <span className="devic-command-bar-result-tool-icon">{customIcon}</span>
                  ) : (
                    <CheckIcon className="devic-command-bar-result-tool-icon" />
                  )}
                  <span className="devic-command-bar-result-tool-name">{tc.summary || tc.name}</span>
                </div>,
              );
            }
            callIdx += 1;
          }
        }

        return elements;
      }

      // Default: no toolGroups, render individually
      return toolCalls.map((tc) => {
        const customRenderer = opts.toolRenderers?.[tc.name];
        if (customRenderer) {
          return (
            <div key={tc.id} className="devic-command-bar-result-tool-item devic-command-bar-result-tool-custom">
              {customRenderer(tc.input, tc.output)}
            </div>
          );
        }
        const customIcon = opts.toolIcons?.[tc.name];
        return (
          <div key={tc.id} className="devic-command-bar-result-tool-item">
            {customIcon ? (
              <span className="devic-command-bar-result-tool-icon">{customIcon}</span>
            ) : (
              <CheckIcon className="devic-command-bar-result-tool-icon" />
            )}
            <span className="devic-command-bar-result-tool-name">{tc.summary || tc.name}</span>
          </div>
        );
      });
    };

    return (
      <div
        ref={containerRef}
        className={`devic-command-bar-container ${className || ''}`}
        data-position={mergedOptions.position}
        data-visible={hook.isVisible}
        style={containerStyle}
      >
        {/* Commands dropdown */}
        {hook.showingCommands && hook.filteredCommands.length > 0 && (
          <div className="devic-command-bar-dropdown">
            <div className="devic-command-bar-dropdown-header">
              <span>Commands</span>
              <span className="devic-command-bar-dropdown-hint">
                <kbd>↑</kbd><kbd>↓</kbd> to navigate, <kbd>Enter</kbd> to select
              </span>
            </div>
            <div className="devic-command-bar-dropdown-list">
              {hook.filteredCommands.map((cmd, index) => (
                <div
                  key={cmd.keyword}
                  className="devic-command-bar-dropdown-item"
                  data-selected={index === hook.selectedCommandIndex}
                  onClick={() => hook.selectCommand(cmd)}
                  onMouseEnter={() => {/* Could update selectedCommandIndex on hover */}}
                >
                  {cmd.icon && (
                    <span className="devic-command-bar-dropdown-icon">{cmd.icon}</span>
                  )}
                  <span className="devic-command-bar-dropdown-keyword">/{cmd.keyword}</span>
                  <span className="devic-command-bar-dropdown-desc">{cmd.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History list */}
        {hook.showingHistory && (
          <div className="devic-command-bar-dropdown">
            <div className="devic-command-bar-dropdown-header">
              <span>Command History</span>
              {hook.history.length > 0 && (
                <button
                  className="devic-command-bar-dropdown-clear"
                  onClick={() => {
                    hook.clearHistory();
                    hook.setShowingHistory(false);
                  }}
                  type="button"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="devic-command-bar-dropdown-list" style={resultMessageStyle}>
              {hook.history.length === 0 ? (
                <div className="devic-command-bar-dropdown-empty">No history yet</div>
              ) : (
                hook.history.map((item, index) => (
                  <div
                    key={`${item}-${index}`}
                    className="devic-command-bar-dropdown-item devic-command-bar-history-item"
                    onClick={() => {
                      hook.setShowingHistory(false);
                      hook.setInputValue(item);
                      hook.focus();
                    }}
                  >
                    <HistoryIcon className="devic-command-bar-dropdown-icon" />
                    <span className="devic-command-bar-history-text">{item}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Result card (above bar when completed) */}
        {mergedOptions.showResultCard && hook.result && !hook.showingHistory && !hook.showingCommands && (
          <div className="devic-command-bar-result">
            {/* Tool calls section */}
            {hook.result.toolCalls.length > 0 && (
              <div className="devic-command-bar-result-tools">
                <div
                  className="devic-command-bar-result-tools-header"
                  data-expanded={toolsExpanded}
                  onClick={() => setToolsExpanded(!toolsExpanded)}
                >
                  <ChevronIcon className="devic-command-bar-result-tools-chevron" />
                  <span>Tool calls</span>
                  <span className="devic-command-bar-result-tools-count">
                    {hook.result.toolCalls.length}
                  </span>
                </div>
                <div
                  className="devic-command-bar-result-tools-list"
                  data-expanded={toolsExpanded}
                >
                  {renderToolCallItems(hook.result.toolCalls, mergedOptions)}
                </div>
              </div>
            )}

            {/* Message section */}
            <div className="devic-command-bar-result-message" style={resultMessageStyle}>
              {hook.result.message.content?.message || (
                <span className="devic-command-bar-result-empty">No response</span>
              )}
            </div>

            {/* Feedback actions */}
            <div className="devic-cmd-result-actions">
              <MessageActions
                messageId={hook.result.message.uid}
                messageContent={hook.result.message.content?.message}
                currentFeedback={feedbackState}
                onFeedback={handleFeedback}
                showCopy={true}
                showFeedback={true}
                theme={feedbackTheme}
              />
            </div>
          </div>
        )}

        {/* Error display */}
        {hook.error && !hook.isProcessing && (
          <div className="devic-command-bar-error">
            {hook.error.message}
          </div>
        )}

        {/* Main bar */}
        <div className="devic-command-bar" style={barStyle}>
          {/* Left: Icon or Loader */}
          <div className="devic-command-bar-icon">
            {hook.isProcessing ? (
              <div className="devic-command-bar-spinner" />
            ) : (
              mergedOptions.icon || <SparklesIcon />
            )}
          </div>

          {/* Center: Input or Processing Summary */}
          {hook.isProcessing ? (
            <div className="devic-command-bar-summary">
              {hook.currentToolSummary || mergedOptions.processingMessage}...
            </div>
          ) : (
            <input
              ref={hook.inputRef}
              type="text"
              className="devic-command-bar-input"
              placeholder={mergedOptions.placeholder}
              value={hook.inputValue}
              onChange={(e) => hook.setInputValue(e.target.value)}
              onKeyDown={hook.handleKeyDown}
            />
          )}

          {/* Right: Shortcut hint */}
          {mergedOptions.showShortcutHint && mergedOptions.shortcut && !hook.isProcessing && (
            <div className="devic-command-bar-shortcut">
              {formatShortcut(mergedOptions.shortcut)}
            </div>
          )}
        </div>
      </div>
    );
  }
);

/**
 * Sparkles icon (default)
 */
function SparklesIcon(): JSX.Element {
  return (
   <svg
              width="18"
              height="18"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Main star - 4-point diamond */}
              <path
                d="M10 2L11.5 8.5L18 10L11.5 11.5L10 18L8.5 11.5L2 10L8.5 8.5L10 2Z"
                fill="currentColor"
                opacity="0.9"
              />
              {/* Small accent star - top right */}
              <path
                d="M16 3L16.5 5L18.5 5.5L16.5 6L16 8L15.5 6L13.5 5.5L15.5 5L16 3Z"
                fill="currentColor"
                opacity="0.6"
              />
              {/* Tiny accent dot - bottom left */}
              <circle cx="4" cy="15" r="1" fill="currentColor" opacity="0.4" />
            </svg>
  );
}

/**
 * Chevron right icon
 */
function ChevronIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/**
 * Check icon
 */
function CheckIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * History icon
 */
function HistoryIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

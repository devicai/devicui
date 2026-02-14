import React, { forwardRef, useImperativeHandle, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAIGenerationButton } from './useAIGenerationButton';
import type {
  AIGenerationButtonProps,
  AIGenerationButtonHandle,
  AIGenerationButtonOptions,
} from './AIGenerationButton.types';
import type { ToolGroupCall } from '../../api/types';
import type { ToolCallSummary } from '../AICommandBar/AICommandBar.types';
import { segmentToolCalls } from '../../utils/toolGroups';
import './AIGenerationButton.css';

const DEFAULT_OPTIONS: Required<AIGenerationButtonOptions> = {
  mode: 'modal',
  prompt: '',
  placeholder: 'Describe what you want to generate...',
  modalTitle: 'Generate with AI',
  modalDescription: '',
  confirmText: 'Generate',
  cancelText: 'Cancel',
  tooltipPlacement: 'top',
  tooltipWidth: 300,
  variant: 'primary',
  size: 'medium',
  icon: undefined as any,
  hideIcon: false,
  label: 'Generate with AI',
  hideLabel: false,
  loadingLabel: 'Generating...',
  color: '#3b82f6',
  backgroundColor: '',
  textColor: '',
  borderColor: '',
  borderRadius: 8,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontSize: 14,
  zIndex: 10000,
  animationDuration: 200,
  toolRenderers: undefined as any,
  toolIcons: undefined as any,
  processingMessage: 'Processing...',
  toolGroups: undefined as any,
};

/**
 * AIGenerationButton component - a button that triggers AI generation with configurable interaction modes
 *
 * @example
 * ```tsx
 * // Direct mode - sends predefined prompt on click
 * <AIGenerationButton
 *   assistantId="my-assistant"
 *   options={{
 *     mode: 'direct',
 *     prompt: 'Generate a summary of the current page',
 *     label: 'Summarize',
 *   }}
 *   onResponse={({ message }) => console.log(message.content)}
 * />
 *
 * // Modal mode - opens modal for user input
 * <AIGenerationButton
 *   assistantId="my-assistant"
 *   options={{
 *     mode: 'modal',
 *     modalTitle: 'Generate Content',
 *     placeholder: 'Describe what you want...',
 *   }}
 *   onResponse={({ message }) => setContent(message.content.message)}
 * />
 *
 * // Tooltip mode - quick inline input
 * <AIGenerationButton
 *   assistantId="my-assistant"
 *   options={{
 *     mode: 'tooltip',
 *     tooltipPlacement: 'bottom',
 *   }}
 *   onResponse={handleGeneration}
 * />
 * ```
 */
export const AIGenerationButton = forwardRef<AIGenerationButtonHandle, AIGenerationButtonProps>(
  function AIGenerationButton(props, ref) {
    const {
      assistantId,
      apiKey,
      baseUrl,
      tenantId,
      tenantMetadata,
      options = {},
      modelInterfaceTools,
      onResponse,
      onBeforeSend,
      onError,
      onStart,
      onOpen,
      onClose,
      disabled,
      className,
      containerClassName,
      children,
      theme,
    } = props;

    const mergedOptions = useMemo(
      () => ({ ...DEFAULT_OPTIONS, ...options }),
      [options]
    );

    const hook = useAIGenerationButton({
      assistantId,
      apiKey,
      baseUrl,
      tenantId,
      tenantMetadata,
      options: mergedOptions,
      modelInterfaceTools,
      onResponse,
      onBeforeSend,
      onError,
      onStart,
      onOpen,
      onClose,
      disabled,
    });

    // Expose handle
    useImperativeHandle(ref, () => ({
      generate: hook.generate,
      open: hook.open,
      close: hook.close,
      reset: hook.reset,
      isProcessing: hook.isProcessing,
    }));

    // Container ref for theming
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    // Apply CSS variables for theming
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const vars: [string, string | undefined][] = [
        ['--devic-gen-primary', mergedOptions.color],
        ['----devic-gen-bg', mergedOptions.backgroundColor || undefined],
        ['--devic-gen-text', mergedOptions.textColor || undefined],
        ['--devic-gen-border', mergedOptions.borderColor || undefined],
        ['--devic-gen-font-family', mergedOptions.fontFamily],
        ['--devic-gen-font-size', typeof mergedOptions.fontSize === 'number' ? `${mergedOptions.fontSize}px` : mergedOptions.fontSize],
        ['--devic-gen-radius', typeof mergedOptions.borderRadius === 'number' ? `${mergedOptions.borderRadius}px` : mergedOptions.borderRadius],
        ['--devic-gen-z-index', String(mergedOptions.zIndex)],
        ['--devic-gen-animation-duration', `${mergedOptions.animationDuration}ms`],
      ];

      // Apply theme from parent if provided
      if (theme) {
        if (theme.backgroundColor) vars.push(['--devic-gen-modal-bg', theme.backgroundColor]);
        if (theme.textColor) vars.push(['--devic-gen-modal-text', theme.textColor]);
        if (theme.borderColor) vars.push(['--devic-gen-modal-border', theme.borderColor]);
        if (theme.primaryColor) vars.push(['--devic-gen-primary', theme.primaryColor]);
      }

      for (const [name, value] of vars) {
        if (value) {
          el.style.setProperty(name, value);
        } else {
          el.style.removeProperty(name);
        }
      }
    }, [mergedOptions, theme]);

    // Click outside to close tooltip
    useEffect(() => {
      if (!hook.isOpen || mergedOptions.mode !== 'tooltip') return;

      const handleClickOutside = (e: MouseEvent) => {
        const tooltip = tooltipRef.current;
        const container = containerRef.current;
        if (
          tooltip &&
          container &&
          !tooltip.contains(e.target as Node) &&
          !container.contains(e.target as Node)
        ) {
          hook.close();
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [hook.isOpen, mergedOptions.mode, hook.close]);

    // Handle button click
    const handleButtonClick = useCallback(() => {
      if (disabled || hook.isProcessing) return;

      if (mergedOptions.mode === 'direct') {
        hook.generate();
      } else {
        hook.open();
      }
    }, [disabled, hook.isProcessing, mergedOptions.mode, hook.generate, hook.open]);

    // Handle confirm in modal/tooltip
    const handleConfirm = useCallback(() => {
      hook.generate();
    }, [hook.generate]);

    // Tooltip position styles
    const tooltipPositionStyle = useMemo(() => {
      const placement = mergedOptions.tooltipPlacement;
      const width = typeof mergedOptions.tooltipWidth === 'number'
        ? `${mergedOptions.tooltipWidth}px`
        : mergedOptions.tooltipWidth;

      const baseStyle: React.CSSProperties = {
        width,
        position: 'absolute',
        zIndex: mergedOptions.zIndex,
      };

      switch (placement) {
        case 'top':
          return { ...baseStyle, bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px' };
        case 'bottom':
          return { ...baseStyle, top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '8px' };
        case 'left':
          return { ...baseStyle, right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '8px' };
        case 'right':
          return { ...baseStyle, left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '8px' };
        default:
          return baseStyle;
      }
    }, [mergedOptions.tooltipPlacement, mergedOptions.tooltipWidth, mergedOptions.zIndex]);

    // Render button content
    // Only show loading state on button for direct mode (modal/tooltip have their own loading)
    const showButtonLoading = hook.isProcessing && mergedOptions.mode === 'direct';

    const renderButtonContent = () => {
      if (children) {
        return children;
      }

      return (
        <>
          {!mergedOptions.hideIcon && (
            <span className="devic-gen-button-icon">
              {showButtonLoading ? (
                <span className="devic-gen-spinner" />
              ) : (
                mergedOptions.icon || <SparklesIcon />
              )}
            </span>
          )}
          {!mergedOptions.hideLabel && (
            <span className="devic-gen-button-label">
              {showButtonLoading ? mergedOptions.loadingLabel : mergedOptions.label}
            </span>
          )}
        </>
      );
    };

    // Render a single tool call item (default rendering)
    const renderSingleToolCall = (tc: ToolCallSummary) => {
      const customRenderer = mergedOptions.toolRenderers?.[tc.name];
      if (customRenderer && tc.status === 'completed') {
        return (
          <div key={tc.id} className="devic-gen-tool-item devic-gen-tool-custom">
            {customRenderer(tc.input, tc.output)}
          </div>
        );
      }

      const customIcon = mergedOptions.toolIcons?.[tc.name];
      const isExecuting = tc.status === 'executing';

      return (
        <div
          key={tc.id}
          className="devic-gen-tool-item"
          data-status={tc.status}
        >
          <span className="devic-gen-tool-icon">
            {isExecuting ? (
              <span className="devic-gen-spinner devic-gen-spinner-small" />
            ) : customIcon ? (
              customIcon
            ) : (
              <CheckIcon />
            )}
          </span>
          <span className="devic-gen-tool-name">{tc.summary || tc.name}</span>
        </div>
      );
    };

    // Render tool calls display
    const renderToolCalls = () => {
      if (!hook.isProcessing || hook.toolCalls.length === 0) {
        return null;
      }

      // Separate completed calls (for grouping) from still-active calls
      const completedCalls = hook.toolCalls.filter((tc) => tc.status === 'completed');
      const activeCalls = hook.toolCalls.filter((tc) => tc.status !== 'completed');

      let completedElements: React.ReactNode[];

      if (mergedOptions.toolGroups && mergedOptions.toolGroups.length > 0 && completedCalls.length > 0) {
        const calls: ToolGroupCall[] = completedCalls.map((tc) => ({
          name: tc.name,
          input: tc.input,
          output: tc.output,
          toolCallId: tc.id,
        }));
        const segments = segmentToolCalls(calls, mergedOptions.toolGroups);
        completedElements = [];
        let callIdx = 0;

        for (const segment of segments) {
          if (segment.type === 'group') {
            const groupKey = segment.calls.map((c) => c.toolCallId).join('-');
            completedElements.push(
              <div key={`gen-group-${groupKey}`} className="devic-gen-tool-item devic-gen-tool-custom">
                {segment.config.renderer(segment.calls)}
              </div>,
            );
            callIdx += segment.calls.length;
          } else {
            completedElements.push(renderSingleToolCall(completedCalls[callIdx]));
            callIdx += 1;
          }
        }
      } else {
        completedElements = completedCalls.map(renderSingleToolCall);
      }

      return (
        <div className="devic-gen-tool-calls">
          {completedElements}
          {activeCalls.map(renderSingleToolCall)}
        </div>
      );
    };

    // Render processing status
    const renderProcessingStatus = () => {
      if (!hook.isProcessing) return null;

      return (
        <div className="devic-gen-processing-status">
          <span className="devic-gen-spinner devic-gen-spinner-small" />
          <span className="devic-gen-processing-text">
            {hook.currentToolSummary || mergedOptions.processingMessage}
          </span>
        </div>
      );
    };

    return (
      <div
        ref={containerRef}
        className={`devic-gen-container ${containerClassName || ''}`}
        style={{ position: 'relative', display: 'inline-block' }}
      >
        {/* Button */}
        <button
          type="button"
          className={`devic-gen-button ${className || ''}`}
          data-variant={mergedOptions.variant}
          data-size={mergedOptions.size}
          data-processing={showButtonLoading}
          onClick={handleButtonClick}
          disabled={disabled || showButtonLoading}
        >
          {renderButtonContent()}
        </button>

        {/* Tooltip */}
        {mergedOptions.mode === 'tooltip' && hook.isOpen && (
          <div
            ref={tooltipRef}
            className="devic-gen-tooltip"
            style={tooltipPositionStyle}
            data-placement={mergedOptions.tooltipPlacement}
          >
            {/* Tool calls display */}
            {renderToolCalls()}
            {/* Processing status when no tool calls yet */}
            {hook.isProcessing && hook.toolCalls.length === 0 && renderProcessingStatus()}
            <textarea
              ref={hook.inputRef}
              className="devic-gen-input"
              placeholder={mergedOptions.placeholder}
              value={hook.inputValue}
              onChange={(e) => hook.setInputValue(e.target.value)}
              onKeyDown={hook.handleKeyDown}
              rows={3}
              disabled={hook.isProcessing}
            />
            {hook.error && (
              <div className="devic-gen-error">{hook.error.message}</div>
            )}
            <div className="devic-gen-tooltip-actions">
              <button
                type="button"
                className="devic-gen-tooltip-cancel"
                onClick={hook.close}
                disabled={hook.isProcessing}
              >
                {mergedOptions.cancelText}
              </button>
              <button
                type="button"
                className="devic-gen-tooltip-confirm"
                onClick={handleConfirm}
                disabled={hook.isProcessing || !hook.inputValue.trim()}
              >
                {hook.isProcessing ? (
                  <>
                    <span className="devic-gen-spinner devic-gen-spinner-small" />
                    {mergedOptions.loadingLabel}
                  </>
                ) : (
                  mergedOptions.confirmText
                )}
              </button>
            </div>
          </div>
        )}

        {/* Modal */}
        {mergedOptions.mode === 'modal' && hook.isOpen && (
          <div
            className="devic-gen-modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget && !hook.isProcessing) hook.close();
            }}
          >
            <div className="devic-gen-modal">
              <div className="devic-gen-modal-header">
                <h3 className="devic-gen-modal-title">{mergedOptions.modalTitle}</h3>
                <button
                  type="button"
                  className="devic-gen-modal-close"
                  onClick={hook.close}
                  aria-label="Close"
                  disabled={hook.isProcessing}
                >
                  <CloseIcon />
                </button>
              </div>
              {mergedOptions.modalDescription && (
                <p className="devic-gen-modal-description">{mergedOptions.modalDescription}</p>
              )}
              <div className="devic-gen-modal-body">
                {/* Tool calls display */}
                {renderToolCalls()}
                {/* Processing status when no tool calls yet */}
                {hook.isProcessing && hook.toolCalls.length === 0 && renderProcessingStatus()}
                <textarea
                  ref={hook.inputRef}
                  className="devic-gen-input"
                  placeholder={mergedOptions.placeholder}
                  value={hook.inputValue}
                  onChange={(e) => hook.setInputValue(e.target.value)}
                  onKeyDown={hook.handleKeyDown}
                  rows={4}
                  disabled={hook.isProcessing}
                />
                {hook.error && (
                  <div className="devic-gen-error">{hook.error.message}</div>
                )}
              </div>
              <div className="devic-gen-modal-footer">
                <button
                  type="button"
                  className="devic-gen-modal-cancel"
                  onClick={hook.close}
                  disabled={hook.isProcessing}
                >
                  {mergedOptions.cancelText}
                </button>
                <button
                  type="button"
                  className="devic-gen-modal-confirm"
                  onClick={handleConfirm}
                  disabled={hook.isProcessing || !hook.inputValue.trim()}
                >
                  {hook.isProcessing ? (
                    <>
                      <span className="devic-gen-spinner devic-gen-spinner-small" />
                      {mergedOptions.loadingLabel}
                    </>
                  ) : (
                    mergedOptions.confirmText
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

/**
 * Default sparkles icon
 */
function SparklesIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10 2L11.5 8.5L18 10L11.5 11.5L10 18L8.5 11.5L2 10L8.5 8.5L10 2Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M16 3L16.5 5L18.5 5.5L16.5 6L16 8L15.5 6L13.5 5.5L15.5 5L16 3Z"
        fill="currentColor"
        opacity="0.6"
      />
      <circle cx="4" cy="15" r="1" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

/**
 * Close icon
 */
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

/**
 * Check icon for completed tool calls
 */
function CheckIcon(): JSX.Element {
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
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

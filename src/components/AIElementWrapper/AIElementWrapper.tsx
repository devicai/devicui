import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useOptionalDevicContext } from '../../provider';
import { useAIElementWrapper } from './useAIElementWrapper';
import {
  getActiveWrapper,
  setActiveWrapper,
  subscribeActiveWrapper,
} from './activeWrapperRegistry';
import { generateId } from '../../utils';
import type {
  AIElementWrapperHandle,
  AIElementWrapperOptions,
  AIElementWrapperPlacement,
  AIElementWrapperProps,
} from './AIElementWrapper.types';
import './AIElementWrapper.css';

const DEFAULT_OPTIONS: Required<
  Omit<AIElementWrapperOptions, 'color' | 'drawerPromptPrefix' | 'defaultInlinePrompt'>
> & {
  color?: string;
  drawerPromptPrefix?: AIElementWrapperOptions['drawerPromptPrefix'];
  defaultInlinePrompt?: string;
} = {
  showOn: 'hover',
  triggerPlacement: 'bottom',
  tooltipPlacement: 'bottom',
  tooltipWidth: 360,
  triggerLabel: 'Preguntar a IA',
  highlightOnInteract: true,
  zIndex: 2147483000,
  triggerBorderRadius: 999,
  color: undefined,
  drawerPromptPrefix: undefined,
  defaultInlinePrompt: undefined,
};

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function rectFromDom(rect: DOMRect): AnchorRect {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function placementStyle(
  placement: AIElementWrapperPlacement,
  anchor: AnchorRect,
  offset = 8
): React.CSSProperties {
  const cx = anchor.left + anchor.width / 2;
  const cy = anchor.top + anchor.height / 2;
  switch (placement) {
    case 'top':
      return { position: 'fixed', top: anchor.top - offset, left: cx, transform: 'translate(-50%, -100%)' };
    case 'bottom':
      return { position: 'fixed', top: anchor.top + anchor.height + offset, left: cx, transform: 'translateX(-50%)' };
    case 'left':
      return { position: 'fixed', top: cy, left: anchor.left - offset, transform: 'translate(-100%, -50%)' };
    case 'right':
      return { position: 'fixed', top: cy, left: anchor.left + anchor.width + offset, transform: 'translateY(-50%)' };
  }
}

/**
 * AIElementWrapper wraps an arbitrary React node and exposes an AI trigger
 * that can either show an inline floating tooltip with the assistant's
 * answer (`behavior='inline'`) or push a reference to the registered
 * ChatDrawer (`behavior='drawer'`).
 *
 * The trigger and inline tooltip are rendered through a React portal anchored
 * to the wrapped element, so they always sit above other UI (including the
 * ChatDrawer) regardless of stacking context.
 */
export const AIElementWrapper = forwardRef<AIElementWrapperHandle, AIElementWrapperProps>(
  function AIElementWrapper(props, ref) {
    const {
      label,
      data,
      referenceContent,
      behavior = 'inline',
      trigger,
      options = {},
      assistantId,
      getPrompt,
      apiKey,
      baseUrl,
      tenantId,
      tenantMetadata,
      modelInterfaceTools,
      inlineRenderer,
      onActivate,
      onInlineResponse,
      onError,
      className,
      style,
      children,
    } = props;

    const merged = useMemo(() => ({ ...DEFAULT_OPTIONS, ...options }), [options]);

    // Stable instance ID used by the active-wrapper registry (singleton)
    const wrapperIdRef = useRef<string>('');
    if (!wrapperIdRef.current) wrapperIdRef.current = generateId();

    const [activeWrapperId, setActiveWrapperLocal] = useState<string | null>(getActiveWrapper());
    useEffect(() => subscribeActiveWrapper(setActiveWrapperLocal), []);

    const context = useOptionalDevicContext();
    const containerRef = useRef<HTMLSpanElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);

    const [isHovered, setIsHovered] = useState(false);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const setHoveredImmediately = useCallback((v: boolean) => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      if (v) {
        setIsHovered(true);
      } else {
        // Grace period so the cursor can travel from the wrapper to the
        // portal-rendered trigger without the trigger disappearing mid-flight.
        hoverTimerRef.current = setTimeout(() => setIsHovered(false), 200);
      }
    }, []);
    useEffect(() => () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    }, []);
    const [isInlineOpen, setIsInlineOpen] = useState(false);
    const [containerRect, setContainerRect] = useState<AnchorRect | null>(null);
    const [selectionRect, setSelectionRect] = useState<AnchorRect | null>(null);

    const inline = useAIElementWrapper({
      assistantId,
      apiKey,
      baseUrl,
      tenantId,
      tenantMetadata,
      modelInterfaceTools,
      onResponse: onInlineResponse,
      onError,
    });

    // What this wrapper would show if there were no coordination.
    const wantsTriggerVisible =
      merged.showOn === 'always' ||
      (merged.showOn === 'hover' && isHovered) ||
      (merged.showOn === 'click' && isInlineOpen) ||
      (merged.showOn === 'select' && selectionRect !== null);

    // Coordinate via the singleton registry so only one wrapper shows the
    // floating trigger at a time. The most recent wrapper to want visibility
    // wins; others hide until they are activated again.
    const isActive = activeWrapperId === wrapperIdRef.current;
    const triggerVisible = wantsTriggerVisible && (activeWrapperId === null || isActive);

    useEffect(() => {
      const id = wrapperIdRef.current;
      if (wantsTriggerVisible) {
        setActiveWrapper(id);
      } else if (getActiveWrapper() === id) {
        setActiveWrapper(null);
      }
    }, [wantsTriggerVisible]);

    // Release the registry slot if the component unmounts while active.
    useEffect(
      () => () => {
        if (getActiveWrapper() === wrapperIdRef.current) {
          setActiveWrapper(null);
        }
      },
      []
    );

    // Track container rect (for hover/click/always trigger and tooltip anchor)
    const updateContainerRect = useCallback(() => {
      const el = containerRef.current;
      if (!el) return;
      setContainerRect(rectFromDom(el.getBoundingClientRect()));
    }, []);

    useLayoutEffect(() => {
      if (!triggerVisible && !isInlineOpen) return;
      updateContainerRect();
      const onScrollOrResize = () => updateContainerRect();
      window.addEventListener('scroll', onScrollOrResize, true);
      window.addEventListener('resize', onScrollOrResize);
      return () => {
        window.removeEventListener('scroll', onScrollOrResize, true);
        window.removeEventListener('resize', onScrollOrResize);
      };
    }, [triggerVisible, isInlineOpen, updateContainerRect]);

    // selectionchange listener for showOn='select'
    useEffect(() => {
      if (merged.showOn !== 'select') {
        setSelectionRect(null);
        return;
      }
      const isInside = (node: Node | null, cont: HTMLElement) => {
        if (!node) return false;
        if (node === cont) return true;
        return cont.contains(node);
      };
      const recompute = () => {
        const sel = window.getSelection();
        const cont = containerRef.current;
        if (!sel || sel.isCollapsed || !cont || sel.rangeCount === 0) {
          setSelectionRect(null);
          return;
        }
        // Don't react to selections happening elsewhere — but tolerate the
        // case where anchor or focus are inside our container.
        if (!isInside(sel.anchorNode, cont) && !isInside(sel.focusNode, cont)) {
          setSelectionRect(null);
          return;
        }
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          setSelectionRect(null);
          return;
        }
        setSelectionRect(rectFromDom(rect));
      };
      const onMouseUp = () => {
        // Run on next tick so the browser commits the final selection state.
        setTimeout(recompute, 0);
      };
      document.addEventListener('selectionchange', recompute);
      document.addEventListener('mouseup', onMouseUp);
      return () => {
        document.removeEventListener('selectionchange', recompute);
        document.removeEventListener('mouseup', onMouseUp);
      };
    }, [merged.showOn]);

    const buildPrompt = useCallback((): string => {
      if (getPrompt) return getPrompt({ data, label });
      if (merged.defaultInlinePrompt) return merged.defaultInlinePrompt;
      // Use selected text if available, otherwise fall back to label
      if (merged.showOn === 'select') {
        const sel = window.getSelection();
        const txt = sel?.toString().trim();
        if (txt) return `Cuéntame más sobre: "${txt}"`;
      }
      return `Cuéntame más sobre: ${label}`;
    }, [getPrompt, data, label, merged.defaultInlinePrompt, merged.showOn]);

    const handleActivate = useCallback(() => {
      onActivate?.();

      if (behavior === 'inline') {
        if (!assistantId) {
          const err = new Error('assistantId is required for behavior="inline"');
          onError?.(err);
          // eslint-disable-next-line no-console
          console.warn('[AIElementWrapper]', err.message);
          return;
        }
        setIsInlineOpen(true);
        inline.reset();
        inline.sendInlinePrompt(buildPrompt());
        return;
      }

      // drawer behavior
      if (!context) {
        // eslint-disable-next-line no-console
        console.warn(
          '[AIElementWrapper] behavior="drawer" requires a DevicProvider ancestor.'
        );
        return;
      }
      // For 'select' showOn, prefer selected text as label content fallback
      let finalLabel = label;
      if (merged.showOn === 'select') {
        const txt = window.getSelection()?.toString().trim();
        if (txt) finalLabel = txt;
      }
      context.addReference({ label: finalLabel, content: referenceContent, data });
      context.openDrawer();
    }, [
      onActivate,
      behavior,
      assistantId,
      onError,
      inline,
      buildPrompt,
      context,
      label,
      referenceContent,
      data,
      merged.showOn,
    ]);

    const closeInline = useCallback(() => {
      setIsInlineOpen(false);
      inline.reset();
    }, [inline]);

    useImperativeHandle(
      ref,
      () => ({
        activate: handleActivate,
        close: closeInline,
      }),
      [handleActivate, closeInline]
    );

    // Click outside to close inline tooltip
    useEffect(() => {
      if (!isInlineOpen) return;
      const handler = (e: MouseEvent) => {
        const t = tooltipRef.current;
        const c = containerRef.current;
        const tr = triggerRef.current;
        const target = e.target as Node;
        if (
          t && !t.contains(target) &&
          c && !c.contains(target) &&
          (!tr || !tr.contains(target))
        ) {
          closeInline();
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [isInlineOpen, closeInline]);

    // Anchor for trigger: selection rect (when showOn='select') else container rect
    const triggerAnchor = merged.showOn === 'select' ? selectionRect : containerRect;
    // Tooltip anchor: container rect (or selection if select mode)
    const tooltipAnchor = merged.showOn === 'select' && selectionRect ? selectionRect : containerRect;

    const triggerStyle = useMemo<React.CSSProperties>(() => {
      if (!triggerAnchor) return { display: 'none' };
      return {
        ...placementStyle(merged.triggerPlacement, triggerAnchor),
        zIndex: merged.zIndex + 1,
        pointerEvents: 'auto',
      };
    }, [triggerAnchor, merged.triggerPlacement, merged.zIndex]);

    const tooltipStyle = useMemo<React.CSSProperties>(() => {
      const w = typeof merged.tooltipWidth === 'number' ? `${merged.tooltipWidth}px` : merged.tooltipWidth;
      if (!tooltipAnchor) return { display: 'none' };
      return {
        ...placementStyle(merged.tooltipPlacement, tooltipAnchor),
        width: w,
        zIndex: merged.zIndex,
      };
    }, [tooltipAnchor, merged.tooltipPlacement, merged.tooltipWidth, merged.zIndex]);

    const renderInlineContent = () => {
      if (inline.error) {
        return <div className="devic-aiwrap-error">{inline.error.message}</div>;
      }
      if (inline.isProcessing) {
        return (
          <div className="devic-aiwrap-processing">
            <span className="devic-aiwrap-spinner" aria-hidden="true" />
            <span>Pensando…</span>
          </div>
        );
      }
      if (inline.response) {
        if (inlineRenderer) return inlineRenderer(inline.response);
        const text =
          typeof inline.response.content === 'string'
            ? inline.response.content
            : (inline.response.content as any)?.message || '';
        return <div className="devic-aiwrap-answer">{text}</div>;
      }
      return null;
    };

    const triggerNode = trigger ?? (
      <button
        type="button"
        className="devic-aiwrap-trigger"
        style={{
          borderRadius:
            typeof merged.triggerBorderRadius === 'number'
              ? `${merged.triggerBorderRadius}px`
              : merged.triggerBorderRadius,
          ...(merged.color ? { ['--devic-aiwrap-color' as any]: merged.color } : {}),
        }}
      >
        <span className="devic-aiwrap-trigger-icon" aria-hidden="true">
          <SparklesIcon />
        </span>
        <span className="devic-aiwrap-trigger-label">{merged.triggerLabel}</span>
      </button>
    );

    const portalTarget = typeof document !== 'undefined' ? document.body : null;

    return (
      <span
        ref={containerRef}
        className={`devic-aiwrap-container ${className || ''}`}
        style={{ position: 'relative', display: 'inline-block', ...style }}
        data-highlight={merged.highlightOnInteract && (isHovered || isInlineOpen) ? 'true' : 'false'}
        onMouseEnter={() => setHoveredImmediately(true)}
        onMouseLeave={() => setHoveredImmediately(false)}
      >
        <span className="devic-aiwrap-content">{children}</span>

        {portalTarget && triggerVisible &&
          createPortal(
            <div
              ref={triggerRef}
              className="devic-aiwrap-trigger-wrapper"
              style={triggerStyle}
              onMouseEnter={() => setHoveredImmediately(true)}
              onMouseLeave={() => setHoveredImmediately(false)}
              onMouseDown={(e) => {
                // Prevent losing the text selection when interacting with trigger
                e.preventDefault();
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleActivate();
              }}
            >
              {triggerNode}
            </div>,
            portalTarget
          )}

        {portalTarget && behavior === 'inline' && isInlineOpen &&
          createPortal(
            <div
              ref={tooltipRef}
              className="devic-aiwrap-tooltip"
              style={tooltipStyle}
              data-placement={merged.tooltipPlacement}
            >
              <div className="devic-aiwrap-tooltip-header">
                <span className="devic-aiwrap-tooltip-label">{label}</span>
                <button
                  type="button"
                  className="devic-aiwrap-tooltip-close"
                  onClick={closeInline}
                  aria-label="Cerrar"
                >
                  <CloseIcon />
                </button>
              </div>
              <div className="devic-aiwrap-tooltip-body">{renderInlineContent()}</div>
            </div>,
            portalTarget
          )}
      </span>
    );
  }
);

function SparklesIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 2L11.5 8.5L18 10L11.5 11.5L10 18L8.5 11.5L2 10L8.5 8.5L10 2Z" opacity="0.95" />
      <path d="M16 3L16.5 5L18.5 5.5L16.5 6L16 8L15.5 6L13.5 5.5L15.5 5L16 3Z" opacity="0.6" />
    </svg>
  );
}

function CloseIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

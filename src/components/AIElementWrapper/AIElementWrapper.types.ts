import type { ChatMessage, ModelInterfaceTool } from '../../api/types';

/**
 * Behavior when the trigger is activated.
 * - 'inline': open a floating tooltip with an inline AI response
 * - 'drawer': add the element as a reference and open the registered ChatDrawer
 */
export type AIElementWrapperBehavior = 'inline' | 'drawer';

/**
 * When to show the trigger.
 * - 'hover': show while the wrapper is hovered
 * - 'click': show while the inline tooltip is open (otherwise hidden)
 * - 'always': always visible
 * - 'select': show only while the user has selected text inside the wrapper
 */
export type AIElementWrapperShowOn = 'hover' | 'click' | 'always' | 'select';

/**
 * Tooltip placement (also used for trigger placement).
 */
export type AIElementWrapperPlacement = 'top' | 'bottom' | 'left' | 'right';

/**
 * Options for AIElementWrapper.
 */
export interface AIElementWrapperOptions {
  /**
   * When the trigger pill becomes visible.
   * @default 'hover'
   */
  showOn?: AIElementWrapperShowOn;

  /**
   * Position of the trigger pill relative to the wrapped element.
   * @default 'bottom'
   */
  triggerPlacement?: AIElementWrapperPlacement;

  /**
   * Position of the inline response tooltip.
   * @default 'bottom'
   */
  tooltipPlacement?: AIElementWrapperPlacement;

  /**
   * Tooltip width when behavior='inline'.
   * @default 360
   */
  tooltipWidth?: number | string;

  /**
   * Label shown inside the default trigger pill.
   * @default 'Preguntar a IA'
   */
  triggerLabel?: string;

  /**
   * Whether to highlight the wrapped content while interacting.
   * @default true
   */
  highlightOnInteract?: boolean;

  /**
   * Z-index for trigger and tooltip overlays.
   * @default 9999
   */
  zIndex?: number;

  /**
   * Primary color used for the trigger gradient and tooltip accents.
   */
  color?: string;

  /**
   * Border radius for the trigger pill and tooltip.
   * @default 999
   */
  triggerBorderRadius?: number | string;

  /**
   * Prefix prepended to the user message when behavior='drawer'.
   * Receives the list of reference labels.
   * Default: "Elemento referenciado: <labels>"
   */
  drawerPromptPrefix?: (labels: string[]) => string;

  /**
   * Default prompt used when behavior='inline' and no getPrompt is provided.
   */
  defaultInlinePrompt?: string;
}

/**
 * Props for AIElementWrapper.
 */
export interface AIElementWrapperProps {
  /**
   * Short label that identifies the element (used as chip text in drawer mode
   * and as default prompt fallback).
   */
  label: string;

  /**
   * Optional structured data describing the element.
   * Passed to getPrompt() and stored on the reference.
   */
  data?: Record<string, any>;

  /**
   * Optional rich content describing the element. Stored on the reference
   * so the chat can render it later.
   */
  referenceContent?: React.ReactNode;

  /**
   * Behavior when the trigger is clicked.
   * @default 'inline'
   */
  behavior?: AIElementWrapperBehavior;

  /**
   * Custom trigger node. When provided, replaces the default pill.
   * Click handler is attached automatically.
   */
  trigger?: React.ReactNode;

  /**
   * Display options.
   */
  options?: AIElementWrapperOptions;

  // ─── Inline behavior props ────────────────────────────────────────────

  /**
   * Assistant ID used when behavior='inline'. Required in that mode.
   */
  assistantId?: string;

  /**
   * Builds the prompt sent to the inline assistant from the data prop.
   * Receives `data` and `label` as inputs.
   */
  getPrompt?: (args: { data?: Record<string, any>; label: string }) => string;

  /**
   * API key (overrides DevicProvider).
   */
  apiKey?: string;

  /**
   * Base URL (overrides DevicProvider).
   */
  baseUrl?: string;

  /**
   * Tenant ID (overrides DevicProvider).
   */
  tenantId?: string;

  /**
   * Tenant metadata (merged with DevicProvider metadata).
   */
  tenantMetadata?: Record<string, any>;

  /**
   * Client-side tools for model interface protocol (inline mode only).
   */
  modelInterfaceTools?: ModelInterfaceTool[];

  /**
   * Custom renderer for the inline response. Defaults to plain text.
   */
  inlineRenderer?: (message: ChatMessage) => React.ReactNode;

  // ─── Callbacks ────────────────────────────────────────────────────────

  /**
   * Called when the trigger is activated.
   */
  onActivate?: () => void;

  /**
   * Called when the inline response completes.
   */
  onInlineResponse?: (message: ChatMessage) => void;

  /**
   * Called when an error occurs during inline generation.
   */
  onError?: (error: Error) => void;

  // ─── Layout ───────────────────────────────────────────────────────────

  /**
   * Wrapper className.
   */
  className?: string;

  /**
   * Inline style merged into the wrapper container.
   */
  style?: React.CSSProperties;

  /**
   * The element to wrap.
   */
  children: React.ReactNode;
}

/**
 * Imperative handle for AIElementWrapper.
 */
export interface AIElementWrapperHandle {
  /**
   * Programmatically activate the trigger.
   */
  activate: () => void;

  /**
   * Close the inline tooltip (no-op for drawer mode).
   */
  close: () => void;
}

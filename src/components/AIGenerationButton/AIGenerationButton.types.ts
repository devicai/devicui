import type { ChatMessage, ModelInterfaceTool, ToolGroupConfig } from '../../api/types';
import type { FeedbackTheme } from '../Feedback';
import type { ToolCallSummary } from '../AICommandBar/AICommandBar.types';

/**
 * Interaction mode for the AIGenerationButton
 * - 'direct': Sends a message immediately on button click (uses predefined prompt)
 * - 'modal': Opens a modal to input a prompt before sending
 * - 'tooltip': Shows a tooltip input for quick prompt entry
 */
export type AIGenerationButtonMode = 'direct' | 'modal' | 'tooltip';

/**
 * Result returned after generation completes
 */
export interface GenerationResult {
  chatUid: string;
  message: ChatMessage;
  toolCalls: ToolCallSummary[];
  rawResponse?: any;
}

/**
 * Options for the AIGenerationButton
 */
export interface AIGenerationButtonOptions {
  /**
   * Interaction mode
   * @default 'modal'
   */
  mode?: AIGenerationButtonMode;

  /**
   * Predefined prompt for 'direct' mode
   * Required when mode is 'direct'
   */
  prompt?: string;

  /**
   * Placeholder text for the input (modal and tooltip modes)
   * @default 'Describe what you want to generate...'
   */
  placeholder?: string;

  /**
   * Modal title (modal mode only)
   * @default 'Generate with AI'
   */
  modalTitle?: string;

  /**
   * Modal description (modal mode only)
   */
  modalDescription?: string;

  /**
   * Confirm button text
   * @default 'Generate'
   */
  confirmText?: string;

  /**
   * Cancel button text
   * @default 'Cancel'
   */
  cancelText?: string;

  /**
   * Tooltip placement (tooltip mode only)
   * @default 'top'
   */
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';

  /**
   * Tooltip width
   * @default 300
   */
  tooltipWidth?: number | string;

  // Button styling

  /**
   * Button variant
   * @default 'primary'
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';

  /**
   * Button size
   * @default 'medium'
   */
  size?: 'small' | 'medium' | 'large';

  /**
   * Custom icon for the button (replaces default sparkles icon)
   */
  icon?: React.ReactNode;

  /**
   * Hide the icon
   * @default false
   */
  hideIcon?: boolean;

  /**
   * Button label
   * @default 'Generate with AI'
   */
  label?: string;

  /**
   * Hide the label (icon only button)
   * @default false
   */
  hideLabel?: boolean;

  /**
   * Loading label shown during processing
   * @default 'Generating...'
   */
  loadingLabel?: string;

  // Theming options

  /**
   * Primary color
   */
  color?: string;

  /**
   * Background color
   */
  backgroundColor?: string;

  /**
   * Text color
   */
  textColor?: string;

  /**
   * Border color
   */
  borderColor?: string;

  /**
   * Border radius
   * @default 8
   */
  borderRadius?: number | string;

  /**
   * Font family
   */
  fontFamily?: string;

  /**
   * Font size
   */
  fontSize?: number | string;

  /**
   * Z-index for modal/tooltip overlays
   * @default 10000
   */
  zIndex?: number;

  /**
   * Animation duration in ms
   * @default 200
   */
  animationDuration?: number;

  /**
   * Custom renderers for tool calls by tool name.
   * When a completed tool has a matching renderer, it replaces the default summary line.
   */
  toolRenderers?: Record<string, (input: any, output: any) => React.ReactNode>;

  /**
   * Custom icons for completed tool calls by tool name.
   * Replaces the default check icon.
   */
  toolIcons?: Record<string, React.ReactNode>;

  /**
   * Message shown while processing (before any tools are called)
   * @default 'Processing...'
   */
  processingMessage?: string;

  /**
   * Tool group configurations for rendering consecutive tool calls together.
   */
  toolGroups?: ToolGroupConfig[];
}

/**
 * Handle for programmatically controlling the AIGenerationButton
 */
export interface AIGenerationButtonHandle {
  /**
   * Trigger generation programmatically
   * @param prompt Optional prompt (overrides predefined prompt in direct mode)
   */
  generate: (prompt?: string) => Promise<GenerationResult | null>;

  /**
   * Open the modal/tooltip (for modal and tooltip modes)
   */
  open: () => void;

  /**
   * Close the modal/tooltip
   */
  close: () => void;

  /**
   * Reset the component state
   */
  reset: () => void;

  /**
   * Check if currently processing
   */
  isProcessing: boolean;
}

/**
 * Props for the AIGenerationButton component
 */
export interface AIGenerationButtonProps {
  /**
   * Assistant identifier
   */
  assistantId: string;

  /**
   * API key (overrides DevicContext)
   */
  apiKey?: string;

  /**
   * Base URL (overrides DevicContext)
   */
  baseUrl?: string;

  /**
   * Tenant ID
   */
  tenantId?: string;

  /**
   * Tenant metadata
   */
  tenantMetadata?: Record<string, any>;

  /**
   * Display and behavior options
   */
  options?: AIGenerationButtonOptions;

  /**
   * Client-side tools for model interface protocol
   */
  modelInterfaceTools?: ModelInterfaceTool[];

  /**
   * Callback when generation completes successfully
   */
  onResponse?: (result: GenerationResult) => void;

  /**
   * Callback before sending the message (can modify the prompt)
   * Return the modified prompt or undefined to use the original
   */
  onBeforeSend?: (prompt: string) => string | undefined | Promise<string | undefined>;

  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void;

  /**
   * Callback when processing starts
   */
  onStart?: () => void;

  /**
   * Callback when modal/tooltip opens
   */
  onOpen?: () => void;

  /**
   * Callback when modal/tooltip closes
   */
  onClose?: () => void;

  /**
   * Whether the button is disabled
   */
  disabled?: boolean;

  /**
   * Additional CSS class for the button
   */
  className?: string;

  /**
   * Additional CSS class for the modal/tooltip container
   */
  containerClassName?: string;

  /**
   * Custom button content (replaces default button rendering)
   */
  children?: React.ReactNode;

  /**
   * Theme for the modal/tooltip (inherited from parent component styling)
   */
  theme?: FeedbackTheme;
}

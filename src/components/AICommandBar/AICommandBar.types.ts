import type { ChatMessage, ModelInterfaceTool } from '../../api/types';

/**
 * Command definition for the command bar
 */
export interface AICommandBarCommand {
  /**
   * The keyword that triggers this command (without the leading /)
   * e.g., "help", "clear", "support"
   */
  keyword: string;

  /**
   * Description shown in the command list
   */
  description: string;

  /**
   * The message to send when this command is selected
   */
  message: string;

  /**
   * Optional icon to show next to the command
   */
  icon?: React.ReactNode;
}

/**
 * Options for positioning and styling the AICommandBar
 */
export interface AICommandBarOptions {
  /**
   * Position mode: 'inline' renders in document flow, 'fixed' positions relative to viewport
   * @default 'inline'
   */
  position?: 'inline' | 'fixed';

  /**
   * Placement when position is 'fixed'. Use CSS values.
   */
  fixedPlacement?: {
    top?: number | string;
    right?: number | string;
    bottom?: number | string;
    left?: number | string;
  };

  /**
   * Keyboard shortcut to toggle the command bar (e.g., "cmd+j", "ctrl+k")
   */
  shortcut?: string;

  /**
   * Show the keyboard shortcut hint in the bar
   * @default true
   */
  showShortcutHint?: boolean;

  /**
   * Placeholder text for the input
   * @default 'Ask AI...'
   */
  placeholder?: string;

  /**
   * Custom icon to display on the left side of the bar
   */
  icon?: React.ReactNode;

  /**
   * Width of the command bar
   * @default 400
   */
  width?: number | string;

  /**
   * Maximum width of the command bar
   */
  maxWidth?: number | string;

  /**
   * Z-index for the command bar
   * @default 9999
   */
  zIndex?: number;

  /**
   * Whether to show the result card after completion
   * @default true
   */
  showResultCard?: boolean;

  /**
   * Maximum height for the result card
   * @default 300
   */
  resultCardMaxHeight?: number | string;

  // Theming options

  /**
   * Primary color (used for accents)
   */
  color?: string;

  /**
   * Background color of the bar
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
   * @default 12
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
   * Padding inside the bar
   */
  padding?: number | string;

  /**
   * Box shadow
   */
  boxShadow?: string;

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

  // History options

  /**
   * Enable command history with arrow up/down navigation.
   * History is stored in localStorage.
   * @default true (opt-out)
   */
  enableHistory?: boolean;

  /**
   * Maximum number of history items to store
   * @default 50
   */
  maxHistoryItems?: number;

  /**
   * localStorage key for storing history
   * @default 'devic-command-bar-history'
   */
  historyStorageKey?: string;

  // Commands options

  /**
   * Predefined commands that can be triggered with /keyword
   * When user types /, a list of available commands is shown.
   */
  commands?: AICommandBarCommand[];

  /**
   * Whether to show the built-in /history command
   * @default true
   */
  showHistoryCommand?: boolean;
}

/**
 * Result returned after command bar execution
 */
export interface CommandBarResult {
  chatUid: string;
  message: ChatMessage;
  toolCalls: ToolCallSummary[];
}

/**
 * Summary of a tool call for display
 */
export interface ToolCallSummary {
  id: string;
  name: string;
  status: 'pending' | 'executing' | 'completed' | 'error';
  summary?: string;
  input?: any;
  output?: any;
  error?: string;
}

/**
 * Handle for programmatically controlling the AICommandBar
 */
export interface AICommandBarHandle {
  /**
   * Open the command bar
   */
  open: () => void;

  /**
   * Close the command bar
   */
  close: () => void;

  /**
   * Toggle the command bar visibility
   */
  toggle: () => void;

  /**
   * Focus the input field
   */
  focus: () => void;

  /**
   * Programmatically submit a message
   */
  submit: (message: string) => Promise<void>;

  /**
   * Reset the command bar to initial state
   */
  reset: () => void;
}

/**
 * Handle for programmatically controlling the ChatDrawer
 */
export interface ChatDrawerHandle {
  /**
   * Open the drawer
   */
  open: () => void;

  /**
   * Close the drawer
   */
  close: () => void;

  /**
   * Toggle the drawer visibility
   */
  toggle: () => void;

  /**
   * Set the chat UID to load
   */
  setChatUid: (chatUid: string) => void;

  /**
   * Send a message in the drawer
   */
  sendMessage: (message: string) => void;
}

/**
 * Props for the AICommandBar component
 */
export interface AICommandBarProps {
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
  options?: AICommandBarOptions;

  /**
   * Controlled visibility state
   */
  isVisible?: boolean;

  /**
   * Callback when visibility changes
   */
  onVisibilityChange?: (visible: boolean) => void;

  /**
   * What happens when execution completes
   * - 'openDrawer': Opens the ChatDrawer with the conversation
   * - 'callback': Fires onResponse callback with result
   * @default 'callback'
   */
  onExecute?: 'openDrawer' | 'callback';

  /**
   * Ref to the ChatDrawer component (required when onExecute is 'openDrawer')
   */
  chatDrawerRef?: React.RefObject<ChatDrawerHandle>;

  /**
   * Callback fired when execution completes (when onExecute is 'callback')
   */
  onResponse?: (response: CommandBarResult) => void;

  /**
   * Client-side tools for model interface protocol
   */
  modelInterfaceTools?: ModelInterfaceTool[];

  /**
   * Callback when a message is submitted
   */
  onSubmit?: (message: string) => void;

  /**
   * Callback when a tool is called
   */
  onToolCall?: (toolName: string, params: Record<string, any>) => void;

  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void;

  /**
   * Callback when the command bar opens
   */
  onOpen?: () => void;

  /**
   * Callback when the command bar closes
   */
  onClose?: () => void;

  /**
   * Additional CSS class
   */
  className?: string;
}

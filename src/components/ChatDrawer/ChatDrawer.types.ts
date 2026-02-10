import type { ChatMessage, ModelInterfaceTool, ChatFile, AgentThreadDto, AgentDto } from '../../api/types';

/**
 * Allowed file types for upload
 */
export interface AllowedFileTypes {
  images?: boolean;
  documents?: boolean;
  audio?: boolean;
  video?: boolean;
}

/**
 * ChatDrawer display options
 */
export interface ChatDrawerOptions {
  /**
   * Drawer position
   * @default 'right'
   */
  position?: 'left' | 'right';

  /**
   * Drawer width as pixels (number) or CSS string (e.g. '50%', '400px')
   * @default '100%'
   */
  width?: number | string;

  /**
   * Whether drawer starts open
   * @default false
   */
  defaultOpen?: boolean;

  /**
   * Primary color for theming
   * @default '#1890ff'
   */
  color?: string;

  /**
   * Welcome message shown at start
   */
  welcomeMessage?: string;

  /**
   * Suggested messages to display as quick actions
   */
  suggestedMessages?: string[];

  /**
   * Enable file uploads
   * @default false
   */
  enableFileUploads?: boolean;

  /**
   * Allowed file types for upload
   */
  allowedFileTypes?: AllowedFileTypes;

  /**
   * Maximum file size in bytes
   * @default 10485760 (10MB)
   */
  maxFileSize?: number;

  /**
   * Placeholder text for input
   * @default 'Type a message...'
   */
  inputPlaceholder?: string;

  /**
   * Title displayed in header. Can be a string or React node.
   */
  title?: string | React.ReactNode;

  /**
   * Show the assistant's image (from its imgUrl) as an avatar next to the title
   * @default false
   */
  showAvatar?: boolean;

  /**
   * Show tool execution timeline
   * @default true
   */
  showToolTimeline?: boolean;

  /**
   * Z-index for the drawer
   * @default 1000
   */
  zIndex?: number;

  /**
   * Border radius for the drawer container
   * @default 0
   */
  borderRadius?: number | string;

  /**
   * Enable a draggable resize handle on the lateral border
   * @default false
   */
  resizable?: boolean;

  /**
   * Minimum width when resizable (px)
   * @default 300
   */
  minWidth?: number;

  /**
   * Maximum width when resizable (px)
   * @default 800
   */
  maxWidth?: number;

  /**
   * Additional inline styles applied to the drawer container
   */
  style?: React.CSSProperties;

  /**
   * Font family override
   */
  fontFamily?: string;

  /**
   * Drawer background color
   */
  backgroundColor?: string;

  /**
   * Text color
   */
  textColor?: string;

  /**
   * Secondary background color (inputs, selector trigger, etc.)
   */
  secondaryBackgroundColor?: string;

  /**
   * Drawer border color
   */
  borderColor?: string;

  /**
   * User bubble background color
   */
  userBubbleColor?: string;

  /**
   * Assistant bubble background color
   */
  assistantBubbleColor?: string;

  /**
   * User bubble text color
   */
  userBubbleTextColor?: string;

  /**
   * Assistant bubble text color
   */
  assistantBubbleTextColor?: string;

  /**
   * Send button background color
   */
  sendButtonColor?: string;

  /**
   * Custom loading indicator to replace the default 3-dot spinner
   */
  loadingIndicator?: React.ReactNode;

  /**
   * Custom send button content. The click handler is managed by an overlay,
   * so the node doesn't need to handle click events.
   */
  sendButtonContent?: React.ReactNode;

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
   * Show feedback buttons (thumbs up/down) on assistant messages
   * @default true
   */
  showFeedback?: boolean;

  /**
   * Custom renderer for the HandoffSubagentWidget.
   * Receives thread/agent data and returns a React node.
   */
  handoffWidgetRenderer?: (props: {
    thread: AgentThreadDto | null;
    agent: AgentDto | null;
    elapsedSeconds: number;
    isTerminal: boolean;
  }) => React.ReactNode;
}

/**
 * Props for the ChatDrawer component
 */
/**
 * Props for ConversationSelector component
 */
export interface ConversationSelectorProps {
  assistantId: string;
  currentChatUid: string | null;
  onSelect: (chatUid: string) => void;
  onNewChat: () => void;
  apiKey?: string;
  baseUrl?: string;
  tenantId?: string;
}

export interface ChatDrawerProps {
  /**
   * Display mode: 'drawer' (default overlay) or 'inline' (embedded, always visible)
   * @default 'drawer'
   */
  mode?: 'drawer' | 'inline';

  /**
   * Callback when active conversation changes
   */
  onConversationChange?: (chatUid: string) => void;

  /**
   * Assistant identifier
   */
  assistantId: string;

  /**
   * Existing chat UID to continue conversation
   */
  chatUid?: string;

  /**
   * Display and behavior options
   */
  options?: ChatDrawerOptions;

  /**
   * Tools enabled from assistant's configured tool groups
   */
  enabledTools?: string[];

  /**
   * Client-side tools for model interface protocol
   */
  modelInterfaceTools?: ModelInterfaceTool[];

  /**
   * Tenant ID (overrides provider)
   */
  tenantId?: string;

  /**
   * Tenant metadata (overrides provider)
   */
  tenantMetadata?: Record<string, any>;

  /**
   * API key (overrides provider)
   */
  apiKey?: string;

  /**
   * Base URL (overrides provider)
   */
  baseUrl?: string;

  /**
   * Callback when a message is sent
   */
  onMessageSent?: (message: ChatMessage) => void;

  /**
   * Callback when a message is received
   */
  onMessageReceived?: (message: ChatMessage) => void;

  /**
   * Callback when a tool is called
   */
  onToolCall?: (toolName: string, params: any) => void;

  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void;

  /**
   * Callback when chat is created
   */
  onChatCreated?: (chatUid: string) => void;

  /**
   * Callback when drawer opens
   */
  onOpen?: () => void;

  /**
   * Callback when drawer closes
   */
  onClose?: () => void;

  /**
   * External control of open state
   */
  isOpen?: boolean;

  /**
   * Additional class name
   */
  className?: string;
}

/**
 * Props for ChatMessages component
 */
export interface ChatMessagesProps {
  messages: ChatMessage[];
  allMessages: ChatMessage[];
  isLoading: boolean;
  welcomeMessage?: string;
  suggestedMessages?: string[];
  onSuggestedClick?: (message: string) => void;
  showToolTimeline?: boolean;
  toolRenderers?: Record<string, (input: any, output: any) => React.ReactNode>;
  toolIcons?: Record<string, React.ReactNode>;
  loadingIndicator?: React.ReactNode;
  /** Show feedback buttons on assistant messages */
  showFeedback?: boolean;
  /** Map of message ID to feedback state */
  feedbackMap?: Map<string, 'positive' | 'negative'>;
  /** Callback when feedback is submitted */
  onFeedback?: (messageId: string, positive: boolean, comment?: string) => void;
  /** Subthread ID from active handoff (for in-progress handoffs) */
  handedOffSubThreadId?: string;
  /** Callback when handoff subagent completes */
  onHandoffCompleted?: () => void;
  /** Custom renderer for the handoff widget */
  handoffWidgetRenderer?: (props: {
    thread: AgentThreadDto | null;
    agent: AgentDto | null;
    elapsedSeconds: number;
    isTerminal: boolean;
  }) => React.ReactNode;
  /** API key for handoff widget API calls */
  apiKey?: string;
  /** Base URL for handoff widget API calls */
  baseUrl?: string;
}

/**
 * Props for ChatInput component
 */
export interface ChatInputProps {
  onSend: (message: string, files?: ChatFile[]) => void;
  disabled?: boolean;
  placeholder?: string;
  enableFileUploads?: boolean;
  allowedFileTypes?: AllowedFileTypes;
  maxFileSize?: number;
  sendButtonContent?: React.ReactNode;
  /** Message shown when input is disabled due to handoff */
  disabledMessage?: string;
}

/**
 * Props for ToolTimeline component
 */
export interface ToolTimelineProps {
  toolCalls: Array<{
    id: string;
    name: string;
    status: 'pending' | 'executing' | 'completed' | 'error';
    result?: any;
    error?: string;
    timestamp: number;
  }>;
}

/**
 * Trigger button position
 */
export interface TriggerPosition {
  bottom?: number;
  right?: number;
  left?: number;
  top?: number;
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
   * Set the chat UID to load a specific conversation
   */
  setChatUid: (chatUid: string) => void;

  /**
   * Send a message in the drawer
   */
  sendMessage: (message: string) => void;
}

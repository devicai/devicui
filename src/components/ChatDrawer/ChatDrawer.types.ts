import type { ChatMessage, ModelInterfaceTool, ChatFile } from '../../api/types';

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
   * Drawer width in pixels
   * @default 400
   */
  width?: number;

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
   * Title displayed in header
   */
  title?: string;

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
}

/**
 * Props for the ChatDrawer component
 */
export interface ChatDrawerProps {
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
  isLoading: boolean;
  welcomeMessage?: string;
  suggestedMessages?: string[];
  onSuggestedClick?: (message: string) => void;
  showToolTimeline?: boolean;
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

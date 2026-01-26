// Provider
export { DevicProvider, DevicContext, useDevicContext, useOptionalDevicContext } from './provider';
export type { DevicProviderConfig, DevicProviderProps, DevicContextValue } from './provider';

// Components
export { ChatDrawer, ChatMessages, ChatInput, ToolTimeline } from './components/ChatDrawer';
export type {
  ChatDrawerProps,
  ChatDrawerOptions,
  ChatMessagesProps,
  ChatInputProps,
  ToolTimelineProps,
  AllowedFileTypes,
} from './components/ChatDrawer';

// Hooks
export { useDevicChat, usePolling, useModelInterface } from './hooks';
export type {
  UseDevicChatOptions,
  UseDevicChatResult,
  UsePollingOptions,
  UsePollingResult,
  UseModelInterfaceOptions,
  UseModelInterfaceResult,
} from './hooks';

// API Client
export { DevicApiClient, DevicApiError } from './api/client';
export type { DevicApiClientConfig } from './api/client';

// API Types
export type {
  ChatMessage,
  ChatFile,
  MessageContent,
  ToolCall,
  ToolCallResponse,
  ProcessMessageDto,
  AssistantResponse,
  AsyncResponse,
  RealtimeChatHistory,
  RealtimeStatus,
  ChatHistory,
  AssistantSpecialization,
  ModelInterfaceTool,
  ModelInterfaceToolSchema,
  PreviousMessage,
  ApiError,
} from './api/types';

// Utilities
export { generateId, deepMerge, debounce, throttle, formatFileSize, storage } from './utils';

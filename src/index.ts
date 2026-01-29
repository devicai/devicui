// Provider
export { DevicProvider, DevicContext, useDevicContext, useOptionalDevicContext } from './provider';
export type { DevicProviderConfig, DevicProviderProps, DevicContextValue } from './provider';

// Components
export { ChatDrawer, ChatMessages, ChatInput, ToolTimeline, ConversationSelector } from './components/ChatDrawer';
export type {
  ChatDrawerProps,
  ChatDrawerOptions,
  ChatDrawerHandle,
  ChatMessagesProps,
  ChatInputProps,
  ToolTimelineProps,
  AllowedFileTypes,
  ConversationSelectorProps,
} from './components/ChatDrawer';

// AICommandBar
export { AICommandBar, useAICommandBar, formatShortcut } from './components/AICommandBar';
export type {
  AICommandBarProps,
  AICommandBarOptions,
  AICommandBarHandle,
  AICommandBarCommand,
  CommandBarResult,
  ToolCallSummary,
} from './components/AICommandBar';

// AutocompleteInput - WIP, not ready for public use
// export { AutocompleteInput, useAutocomplete } from './components/AutocompleteInput';
// export type {
//   AutocompleteInputProps,
//   AutocompleteInputOptions,
//   AutocompleteInputHandle,
//   UseAutocompleteOptions,
//   UseAutocompleteResult,
// } from './components/AutocompleteInput';

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
  ConversationSummary,
} from './api/types';

// Utilities
export { generateId, deepMerge, debounce, throttle, formatFileSize, storage } from './utils';

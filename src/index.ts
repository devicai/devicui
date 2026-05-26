// Provider
export { DevicProvider, DevicContext, useDevicContext, useOptionalDevicContext } from './provider';
export type {
  DevicProviderConfig,
  DevicProviderProps,
  DevicContextValue,
  AIReference,
  DrawerRegistration,
} from './provider';

// Components
export { ChatDrawer, ChatMessages, ChatInput, ToolTimeline, ConversationSelector, HandoffSubagentWidget } from './components/ChatDrawer';
export type {
  ChatDrawerProps,
  ChatDrawerOptions,
  ChatDrawerHandle,
  ChatMessagesProps,
  ChatInputProps,
  CustomPromptBoxProps,
  ToolTimelineProps,
  AllowedFileTypes,
  ConversationSelectorProps,
  HandoffSubagentWidgetProps,
  SuggestedMessage,
} from './components/ChatDrawer';

// ThreadStateTag
export { ThreadStateTag } from './components/ThreadStateTag';
export type { ThreadStateTagProps, StateConfig } from './components/ThreadStateTag';

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

// AIGenerationButton
export { AIGenerationButton, useAIGenerationButton } from './components/AIGenerationButton';
export type {
  AIGenerationButtonProps,
  AIGenerationButtonOptions,
  AIGenerationButtonHandle,
  AIGenerationButtonMode,
  GenerationResult,
} from './components/AIGenerationButton';

// AIElementWrapper
export { AIElementWrapper, useAIElementWrapper } from './components/AIElementWrapper';
export type {
  AIElementWrapperProps,
  AIElementWrapperOptions,
  AIElementWrapperHandle,
  AIElementWrapperBehavior,
  AIElementWrapperShowOn,
  AIElementWrapperPlacement,
} from './components/AIElementWrapper';

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
export { useDevicChat, usePolling, useModelInterface, useSpeechRecording } from './hooks';
export type {
  UseDevicChatOptions,
  UseDevicChatResult,
  UsePollingOptions,
  UsePollingResult,
  UseModelInterfaceOptions,
  UseModelInterfaceResult,
  PendingWidgetCall,
  HandleToolCallsResult,
  UseSpeechRecordingOptions,
  UseSpeechRecordingResult,
  SpeechRecordingStatus,
} from './hooks';

// API Client
export { DevicApiClient, DevicApiError } from './api/client';
export type { DevicApiClientConfig } from './api/client';

// API Types
export {
  AgentThreadState,
} from './api/types';

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
  ResponseWidgetProps,
  ResponseWidgetConfig,
  PreviousMessage,
  ApiError,
  ConversationSummary,
  FeedbackSubmission,
  FeedbackEntry,
  AgentThreadDto,
  AgentTaskDto,
  AgentDto,
  HandOffToolResponse,
  ToolGroupCall,
  ToolGroupConfig,
  WhisperTranscriptionResponse,
} from './api/types';

// Feedback Components
export { MessageActions, FeedbackModal } from './components/Feedback';
export type { MessageActionsProps, FeedbackModalProps, FeedbackState, FeedbackTheme } from './components/Feedback';

// Utilities
export { generateId, deepMerge, debounce, throttle, formatFileSize, storage, segmentToolCalls } from './utils';
export type { ToolGroupSegment } from './utils';

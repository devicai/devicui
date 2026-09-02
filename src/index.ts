// Provider
export { DevicProvider, DevicContext, useDevicContext, useOptionalDevicContext } from './provider';
export type {
  DevicProviderConfig,
  DevicProviderProps,
  DevicContextValue,
  TenantMetadata,
  SubtenantMetadata,
  AIReference,
  DrawerRegistration,
} from './provider';

// Components
export { ChatDrawer, ChatMessages, ChatInput, ToolTimeline, ConversationSelector, HandoffSubagentWidget, ReferenceChip, UsageBar, LimitBanner, QueueNotice, RecalledMemoriesWidget } from './components/ChatDrawer';
export type {
  ChatDrawerProps,
  ChatDrawerOptions,
  ChatDrawerHandle,
  ChatMessagesProps,
  ChatInputProps,
  CustomPromptBoxProps,
  MessageBubbleRenderer,
  MessageBubbleRendererProps,
  ToolTimelineProps,
  AllowedFileTypes,
  ConversationSelectorProps,
  HandoffSubagentWidgetProps,
  ReferenceChipProps,
  ReferenceChipVariant,
  SuggestedMessage,
  UsageBarProps,
  UsageBarDisplay,
  UsageBarData,
  LimitBannerProps,
  QueueNoticeProps,
  RecalledMemoriesWidgetProps,
  RecalledMemoriesRenderer,
  RecalledMemoriesRendererProps,
} from './components/ChatDrawer';

// CoreMemoryModal
export { CoreMemoryModal } from './components/CoreMemoryModal';
export type { CoreMemoryModalProps } from './components/CoreMemoryModal';

// IntegrationsModal
export {
  IntegrationsModal,
  IntegrationsLauncher,
  IntegrationsHint,
  IntegrationLogo,
  useIntegrations,
  McpServersSection,
  McpConnectForm,
  useTenantMcp,
  // Where the per-message switches are remembered. Exported so a host that
  // logs its user out can drop that user's choice with them.
  integrationChoiceKey,
  readIntegrationChoice,
  writeIntegrationChoice,
  pruneIntegrationChoice,
} from './components/IntegrationsModal';
export type {
  IntegrationsModalProps,
  IntegrationsLauncherProps,
  IntegrationsHintProps,
  IntegrationLogoProps,
  IntegrationsState,
  IntegrationsScope,
  UseIntegrationsOptions,
  McpServersSectionProps,
  McpConnectFormProps,
  TenantMcpState,
  UseTenantMcpOptions,
} from './components/IntegrationsModal';

// What the API says about an assistant, fetched at most once per assistant.
// Exported because a host that builds its own header needs the same answer the
// drawer uses, and asking for it twice is exactly what this avoids.
export { useAssistantInfo, forgetAssistant } from './api/assistantInfo';
export type {
  AssistantInfoState,
  UseAssistantInfoOptions,
} from './api/assistantInfo';

// Theming shared by the dialogs (the drawer passes its own down)
export { createSharedSession } from './provider/sharedSession';
export { themeVars, isDarkTheme } from './components/theme';
export type { DevicTheme } from './components/theme';

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
export {
  useDevicChat,
  usePolling,
  resolvePollingInterval,
  DEFAULT_POLLING_INTERVAL_MS,
  MIN_POLLING_INTERVAL_MS,
  useModelInterface,
  useSpeechRecording,
} from './hooks';
export type {
  UseDevicChatOptions,
  UseDevicChatResult,
  SendMessageResult,
  StopResult,
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
export type { DevicApiClientConfig, TenantSessionToken } from './api/client';

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
  QueueDisposition,
  StopChatResponse,
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
  TenantLimitExceeded,
  TenantUsage,
  TenantUsageRule,
  TenantUsageHistoryRow,
  TenantUsageHistoryQuery,
  RecalledMemoryRecord,
  RecalledMemoryFact,
  RecalledMemoryEntity,
  RecalledMemoryTurn,
  CoreMemorySnapshot,
  CoreMemoryEntry,
  CoreMemoryLimits,
  CoreMemoryList,
  Integration,
  IntegrationAccount,
  IntegrationAuthField,
  IntegrationAuthScheme,
  IntegrationSetupRequired,
  TenantMcpAuthMode,
  TenantMcpConnection,
  TenantMcpServer,
  TenantMcpListing,
  TenantMcpAuthInput,
  TenantMcpConnectResult,
} from './api/types';

// Feedback Components
export { MessageActions, FeedbackModal } from './components/Feedback';
export type { MessageActionsProps, FeedbackModalProps, FeedbackState, FeedbackTheme } from './components/Feedback';

// Utilities
export { generateId, deepMerge, debounce, throttle, formatFileSize, storage, segmentToolCalls } from './utils';
export type { ToolGroupSegment } from './utils';

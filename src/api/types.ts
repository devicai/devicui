import type React from 'react';

/**
 * File attachment for messages
 */
export interface ChatFile {
  name: string;
  downloadUrl?: string;
  fileType?: 'image' | 'document' | 'audio' | 'video' | 'other';
}

/**
 * Message content structure
 */
export interface MessageContent {
  message?: string;
  data?: any;
  files?: Array<{
    name: string;
    url: string;
    type: string;
  }>;
}

/**
 * Tool call from the model
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Chat message structure
 */
export interface ChatMessage {
  uid: string;
  role: 'user' | 'assistant' | 'developer' | 'system' | 'tool';
  content: MessageContent;
  timestamp: number;
  chatUid?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  summary?: string;
  /**
   * Id of a speech-to-text transcript (from POST /api/v1/whisper) that seeded
   * this message. Present on user messages dictated by voice; the chat can use
   * it to fetch the source audio (GET /api/v1/whisper/:transcriptId) and offer
   * playback.
   */
  transcriptId?: string;
}

/**
 * Previous conversation message for initialization
 */
export interface PreviousMessage {
  message: string;
  role: 'user' | 'assistant';
}

/**
 * Model interface tool schema following OpenAI function calling format
 */
export interface ModelInterfaceToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

/**
 * Props passed to a response widget component.
 * The widget is responsible for collecting the user's response and
 * calling `submit` with the payload to resolve the tool call.
 */
export interface ResponseWidgetProps {
  /** The tool call this widget is responding to */
  toolCall: ToolCall;
  /** Parsed arguments from the tool call */
  params: any;
  /** Submit the tool response payload (sent as the tool call result to the model) */
  submit: (response: any) => void;
  /** Cancel the tool call. Sends an error response so the model can continue. */
  cancel?: (reason?: string) => void;
  /** Whether the widget is currently submitting */
  isSubmitting?: boolean;
}

/**
 * Interactive response widget configuration for a client-side tool.
 *
 * When the model calls a tool configured with a `responseWidget`, the
 * widget is rendered in the chat UI instead of executing a callback.
 * The user interacts with the widget, which calls `submit(response)` to
 * define the tool response sent back to the model.
 *
 * - `render: 'inline'` renders the widget in the message thread at the
 *   position of the tool call. The text input remains enabled.
 * - `render: 'input'` replaces the chat input area with the widget
 *   while it is pending. The text input is disabled until submission.
 */
export interface ResponseWidgetConfig {
  /** Where to render the widget */
  render: 'inline' | 'input';
  /** The widget component */
  component: React.ComponentType<ResponseWidgetProps>;
}

/**
 * Model interface tool definition for client-side tools.
 *
 * A tool must provide either a `callback` (executed automatically when
 * the model invokes the tool) or a `responseWidget` (renders UI for
 * the user to produce the tool response). Providing both is an error.
 */
export interface ModelInterfaceTool {
  toolName: string;
  schema: ModelInterfaceToolSchema;
  /** Executed automatically when the model calls this tool */
  callback?: (params: any) => Promise<any> | any;
  /** Interactive widget that collects the user's tool response */
  responseWidget?: ResponseWidgetConfig;
}

/**
 * Tool call response to send back to the API
 */
export interface ToolCallResponse {
  tool_call_id: string;
  content: any;
  role: 'tool';
}

/**
 * DTO for sending messages to the assistant
 */
export interface ProcessMessageDto {
  message: string;
  chatUid?: string;
  userName?: string;
  files?: ChatFile[];
  metadata?: {
    promptTemplateParams?: Record<string, any>;
    tenantToken?: string;
    [key: string]: any;
  };
  tenantId?: string;
  previousConversation?: PreviousMessage[];
  enabledTools?: string[];
  provider?: string;
  model?: string;
  // Model interface protocol fields
  tools?: ModelInterfaceToolSchema[];
  applicationState?: Record<string, any>;
  skipSummarization?: boolean;
  /**
   * Id of a speech-to-text transcript (from POST /api/v1/whisper) that seeded
   * this message. Sent so the conversation keeps a link to the original audio.
   */
  transcriptId?: string;
}

/**
 * Response from the /whisper speech-to-text endpoint.
 */
export interface WhisperTranscriptionResponse {
  /** Public id of the transcript; send it back as ProcessMessageDto.transcriptId. */
  transcriptId: string;
  /** Transcribed text. */
  text: string;
  /** Language hint used, if any. */
  language?: string;
  /** Download URL of the source audio. */
  audioUrl?: string;
  /** Transcription model used. */
  model?: string;
}

/**
 * Response from the assistant
 */
export interface AssistantResponse {
  messages: ChatMessage[];
  chatUid: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Async mode response
 */
export interface AsyncResponse {
  chatUid: string;
  message?: string;
  error?: string;
}

/**
 * Real-time chat history status.
 * `limit_exceeded` means the message was blocked before reaching the LLM
 * because a configured tenant/subtenant usage limit was reached.
 */
export type RealtimeStatus =
  | 'processing'
  | 'completed'
  | 'error'
  | 'waiting_for_tool_response'
  | 'handed_off'
  | 'limit_exceeded';

/**
 * Details of a tenant/subtenant usage limit that blocked a message.
 * Returned on the realtime endpoint when status is `limit_exceeded`, and on
 * the HTTP 429 body (`details`) when a synchronous request is blocked.
 */
export interface TenantLimitExceeded {
  /** Human-readable message describing the block. */
  message?: string;
  /** The rule that triggered the block (scope, metric, window, limit…). */
  blockingRule?: {
    scope?: 'tenant' | 'subtenant';
    subtenantId?: string;
    metric?: 'tokens' | 'cost';
    windowUnit?: 'hour' | 'day' | 'week' | 'month';
    windowEvery?: number;
    limit?: number;
  };
  /** Current consumption in the blocking window. */
  current?: number;
  /** The limit that was reached. */
  limit?: number;
  /** Epoch ms when the blocking window resets and usage is allowed again. */
  resetsAt?: number;
}

/**
 * Real-time chat history response
 */
export interface RealtimeChatHistory {
  chatUID: string;
  clientUID: string;
  chatHistory: ChatMessage[];
  status: RealtimeStatus;
  lastUpdatedAt: number;
  pendingToolCalls?: ToolCall[];
  handedOffSubThreadId?: string;
  /** Present only when status is `limit_exceeded`. */
  limitExceeded?: TenantLimitExceeded;
}

/**
 * A single usage rule with its current consumption (from GET
 * /api/v1/tenant-usage/:tenantId[/subtenants/:subtenantId]).
 */
export interface TenantUsageRule {
  scope: 'tenant' | 'subtenant';
  subtenantId?: string;
  metric: 'tokens' | 'cost';
  windowUnit: 'hour' | 'day' | 'week' | 'month';
  windowEvery: number;
  /** Configured limit for the window. */
  limit: number;
  /** Current consumption in the active window. */
  current: number;
  /** Utilization percentage (0..100, capped). */
  percent: number;
  /** Epoch ms when the active window resets. */
  resetsAt?: number;
  /** Where the rule comes from ('tier' | 'adhoc'). */
  origin?: string;
  /** Tier the rule belongs to, if any. */
  tierId?: string;
}

/**
 * Response of GET /api/v1/tenant-usage/:tenantId[/subtenants/:subtenantId]:
 * the effective usage rules with their current consumption + the active tier.
 */
export interface TenantUsage {
  tenantId: string;
  subtenantId?: string;
  tierId?: string;
  usage: TenantUsageRule[];
}

/**
 * A durable per-window usage history row (from GET
 * /api/v1/tenant-usage/:tenantId/history).
 */
export interface TenantUsageHistoryRow {
  clientUID: string;
  tenantId: string;
  subtenantId: string;
  scope: 'tenant' | 'subtenant';
  metric: 'tokens' | 'cost';
  windowUnit: 'hour' | 'day' | 'week' | 'month';
  windowEvery: number;
  windowKey: string;
  windowStart: number;
  windowEnd: number;
  /** Counted consumption (enforced). */
  consumption: number;
  /** Exempt consumption that did not count toward the limit, if any. */
  exemptConsumption?: number;
  limit: number;
  percent: number;
  tierId?: string;
  origin?: string;
  capturedAt: number;
}

/**
 * Options for querying tenant usage history.
 */
export interface TenantUsageHistoryQuery {
  subtenantId?: string;
  scope?: 'tenant' | 'subtenant';
  metric?: 'tokens' | 'cost';
  windowUnit?: 'hour' | 'day' | 'week' | 'month';
  /** Epoch ms lower bound (windowEnd >= from). */
  from?: number;
  /** Epoch ms upper bound (windowEnd <= to). */
  to?: number;
  limit?: number;
  skip?: number;
}

/**
 * Chat history structure
 */
export interface ChatHistory {
  chatUID: string;
  clientUID: string;
  userUID: string;
  chatContent: ChatMessage[];
  name?: string;
  assistantSpecializationIdentifier: string;
  creationTimestampMs: number;
  lastEditTimestampMs?: number;
  llm?: string;
  inputTokens?: number;
  outputTokens?: number;
  metadata?: Record<string, any>;
  tenantId?: string;
  handedOff?: boolean;
  handedOffSubThreadId?: string;
  handedOffToolCallId?: string;
}

/**
 * Assistant specialization info
 */
export interface AssistantSpecialization {
  identifier: string;
  name: string;
  description: string;
  state: 'active' | 'inactive' | 'coming_soon';
  imgUrl?: string;
  availableToolsGroups?: Array<{
    name: string;
    description?: string;
    uid?: string;
    iconUrl?: string;
    tools?: Array<{
      name: string;
      description: string;
    }>;
  }>;
  model?: string;
  isCustom?: boolean;
  creationTimestampMs?: number;
}

/**
 * Summary of a conversation for listing
 */
export interface ConversationSummary {
  chatUID: string;
  name?: string;
  creationTimestampMs: number;
  lastEditTimestampMs?: number;
}

export interface ListConversationsResponse {
  histories: ConversationSummary[];
  total: number;
  offset: number;
  limit: number;
}

/**
 * API error response
 */
export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
  /** Optional structured details (e.g. usage-limit blocking info on a 429). */
  details?: any;
}

/**
 * Feedback submission request
 */
export interface FeedbackSubmission {
  messageId: string;
  feedback?: boolean;
  feedbackComment?: string;
  feedbackData?: Record<string, any>;
}

/**
 * Feedback entry response
 */
export interface FeedbackEntry {
  _id: string;
  requestId: string;
  chatUID?: string;
  threadId?: string;
  agentId?: string;
  feedback?: boolean;
  feedbackComment?: string;
  feedbackData?: Record<string, any>;
  creationTimestamp: string;
  lastEditTimestamp?: string;
}

/**
 * Agent thread states
 */
export enum AgentThreadState {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TERMINATED = 'terminated',
  PAUSED = 'paused',
  PAUSED_FOR_APPROVAL = 'paused_for_approval',
  APPROVAL_REJECTED = 'approval_rejected',
  WAITING_FOR_RESPONSE = 'waiting_for_response',
  PAUSED_FOR_RESUME = 'paused_for_resume',
  HANDED_OFF = 'handed_off',
  GUARDRAIL_TRIGGER = 'guardrail_trigger',
}

/**
 * Task within an agent thread
 */
export interface AgentTaskDto {
  _id?: string;
  title?: string;
  description?: string;
  completed: boolean;
}

/**
 * Agent thread DTO
 */
export interface AgentThreadDto {
  _id?: string;
  agentId: string;
  state: AgentThreadState;
  threadContent: ChatMessage[];
  tasks?: AgentTaskDto[];
  finishReason?: string;
  pausedReason?: string;
  name?: string;
  creationTimestampMs?: number;
  lastEditTimestampMs?: number;
  pauseUntil?: number;
  isSubthread?: boolean;
  parentThreadId?: string;
  subThreadToolCallId?: string;
  parentAgentId?: string;
}

/**
 * Agent details
 */
export interface AgentDto {
  _id?: string;
  name: string;
  description?: string;
  imgUrl?: string;
  agentId?: string;
}

/**
 * Hand-off tool response content
 */
export interface HandOffToolResponse {
  response: string;
  subthreadId: string;
}

/**
 * Represents a single tool call within a tool group
 */
export interface ToolGroupCall {
  name: string;
  input: any;
  output: any;
  toolCallId: string;
}

/**
 * Configuration for grouping consecutive tool calls under a single renderer
 */
export interface ToolGroupConfig {
  tools: string[];
  renderer: (calls: ToolGroupCall[]) => React.ReactNode;
}

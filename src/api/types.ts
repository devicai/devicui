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
  role: 'user' | 'assistant' | 'developer' | 'tool';
  content: MessageContent;
  timestamp: number;
  chatUid?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  summary?: string;
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
 * Model interface tool definition for client-side tools
 */
export interface ModelInterfaceTool {
  toolName: string;
  schema: ModelInterfaceToolSchema;
  callback: (params: any) => Promise<any> | any;
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
 * Real-time chat history status
 */
export type RealtimeStatus = 'processing' | 'completed' | 'error' | 'waiting_for_tool_response' | 'handed_off';

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

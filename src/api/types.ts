import type { AvatarStyle } from '../utils/avatar';

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
 * Attachment as it appears on a message.
 *
 * Two shapes reach the UI for the same thing: the optimistic message built
 * locally on send uses `url`/`type`, while the history returned by the API
 * carries the stored `downloadUrl`/`fileType`. Both are accepted here; use
 * `normalizeMessageFile` before reading them.
 */
export interface MessageFile {
  name: string;
  url?: string;
  type?: string;
  downloadUrl?: string;
  fileType?: string;
}

/**
 * Message content structure
 */
export interface MessageContent {
  message?: string;
  data?: any;
  files?: MessageFile[];
}

/** Collapse either attachment shape into a single one the UI can render. */
export function normalizeMessageFile(file: MessageFile): {
  name: string;
  url: string;
  type: string;
} {
  return {
    name: file.name,
    url: file.url || file.downloadUrl || '',
    type: file.type || file.fileType || 'other',
  };
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
   * Where `content.message` came from, when the model did not write it.
   * `'finish_tool'`: the assistant is configured to require a tool call to
   * finish ("Require Tool Use to Finish") and the backend lifted the reply from
   * the finish tool's `message` argument, so it can be read without parsing
   * tool calls. Absent on replies the model wrote itself — use it to label the
   * bubble as produced by the tool.
   */
  contentSource?: string;
  /**
   * Id of a speech-to-text transcript (from POST /api/v1/whisper) that seeded
   * this message. Present on user messages dictated by voice; the chat can use
   * it to fetch the source audio (GET /api/v1/whisper/:transcriptId) and offer
   * playback.
   */
  transcriptId?: string;
  /**
   * Original server uid, present when the UI adopted an optimistic uid for
   * this message to keep React keys stable. Server-side references (e.g.
   * memory recall anchors) match against it.
   */
  serverUid?: string;
  /**
   * Client-side only: the conversation was busy when this message was sent, so
   * it was accepted into the queue and is waiting its turn. Drawn as a message
   * that has not landed rather than as part of the conversation. Falls away on
   * its own once the message comes back inside the history.
   */
  queued?: boolean;
  /**
   * Client-side only: when this message was accepted into the queue. Used to
   * tell "the server has not reported it yet" from "the server no longer has
   * it", which the timestamp is the only honest way to decide.
   */
  queuedAt?: number;
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
  /**
   * The client-side tools still on offer for the rest of the turn. The API
   * reads them off the first response of the batch: leaving them out drops
   * the tools from the continuation, so the model cannot call them again.
   */
  tools?: ModelInterfaceToolSchema[];
}

/**
 * DTO for sending messages to the assistant
 */
export interface ProcessMessageDto {
  message: string;
  chatUid?: string;
  userName?: string;
  files?: ChatFile[];
  /** Tags to associate with this chat (top-level, distinct from `metadata`). */
  tags?: string[];
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
  /**
   * The conversation could not take the message right now, so it was queued
   * instead of starting a run of its own. Still an acceptance: the answer comes
   * later, and may cover several messages at once.
   */
  queued?: boolean;
  /** How many messages are queued on this conversation, this one included. */
  queuePosition?: number;
  /** When the queued message reaches the model. */
  willProcess?: QueueDisposition;
}

/**
 * When a queued message will reach the model.
 *
 * `after_delay` is the one that is not about being busy: an idle conversation
 * on an assistant with an input delay collects what is written during the
 * window, so a message can come back queued with nothing in flight at all.
 */
export type QueueDisposition = 'after_delay' | 'next_turn' | 'on_resume';

/** Response of the stop endpoint. */
export interface StopChatResponse {
  chatUid: string;
  message: string;
  /**
   * Queued messages the stop threw away — answering them would be the opposite
   * of what was asked. Handed back so their text can be put where the user
   * wrote it. Absent on an API older than this, and when nothing was queued.
   */
  discardedMessages?: ChatMessage[];
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
  | 'limit_exceeded'
  /** Collecting messages during the assistant's input delay, before any run. */
  | 'buffering';

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

/** One fact a long-term-memory recall surfaced. */
export interface RecalledMemoryFact {
  fact: string;
  relation: string;
  /** Source entity name of the graph edge, when the fact connects two. */
  source: string | null;
  /** Target entity name of the graph edge, when the fact connects two. */
  target: string | null;
  /** ISO date the fact became valid, if known. */
  validAt: string | null;
}

/** One graph entity a long-term-memory recall surfaced. */
export interface RecalledMemoryEntity {
  id: string;
  name: string;
  type: string;
  summary: string | null;
}

/** One previous-session turn a conversation-start recall carried over. */
export interface RecalledMemoryTurn {
  role: string;
  content: string;
}

/**
 * One structured long-term-memory recall event of a conversation: the facts,
 * entities and previous-session turns a recall surfaced, plus the uid of the
 * message that brought it in (`messageUid`: the initial user message, or the
 * assistant message carrying the memory tool call — resolvable through
 * `toolCallId` while the run is still in flight).
 */
export interface RecalledMemoryRecord {
  uid: string;
  messageUid?: string;
  toolCallId?: string;
  source:
    | 'conversation_start'
    | 'search_memory'
    | 'search_memory_nodes'
    | 'explore_memory_graph';
  query?: string;
  facts?: RecalledMemoryFact[];
  entities?: RecalledMemoryEntity[];
  turns?: RecalledMemoryTurn[];
  timestampMs: number;
}

/**
 * Snapshot of the core-memory block a conversation saw (audit trail): the
 * render revision plus the injected entries as structured items.
 */
export interface CoreMemorySnapshot {
  uid: string;
  revision: string;
  items: Array<{
    id: number;
    section: string;
    content: string;
    pinned: boolean;
    source: string;
  }>;
  entries: number;
  omitted: number;
  chars: number;
  timestampMs: number;
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
  /**
   * Memory-recall events of the in-flight run — lets the UI show what the
   * assistant is recalling while the response is still processing.
   */
  recalledMemories?: RecalledMemoryRecord[];
  /**
   * Messages accepted into this conversation that the model has not seen yet.
   * Non-zero means more is coming: a `completed` status with messages still
   * queued is not the end of the exchange.
   */
  queuedMessages?: number;
  /**
   * The queued messages themselves. This is the conversation's queue, not the
   * caller's — it can include messages the same conversation received through
   * another channel. Absent on an API that does not return them, in which case
   * the widget falls back to its own optimistic copies.
   */
  pendingUserMessages?: ChatMessage[];
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
  /** Structured long-term-memory recall events of the conversation. */
  recalledMemories?: RecalledMemoryRecord[];
  /** Audit trail of the core-memory blocks the conversation saw. */
  coreMemories?: CoreMemorySnapshot[];
}

/** One core memory entry (the always-injected tier), as returned by the memory API. */
export interface CoreMemoryEntry {
  id: number;
  section: string;
  content: string;
  source: string;
  pinned: boolean;
  supersedes: number | null;
  archivedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Deployment caps of the core memory tier. */
export interface CoreMemoryLimits {
  maxChars: number;
  maxEntries: number;
  maxEntryChars: number;
}

/**
 * Response of GET /api/v1/memory/assistants/:identifier/core — the entries
 * of the bucket the assistant resolves for a tenant/subtenant combination.
 */
export interface CoreMemoryList {
  /** False when the assistant does not have the core memory tier enabled. */
  enabled: boolean;
  /** The resolved bucket tuple (tenant/subtenant/owner dimensions). */
  bucket: { tenantId?: string; subtenantId?: string; entityId?: string };
  entries: CoreMemoryEntry[];
  limits?: CoreMemoryLimits;
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
  /** Pinned style of the generated avatar shown when there is no imgUrl. */
  avatarStyle?: AvatarStyle;
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
  /**
   * Whether this assistant offers MCP servers of the tenant's own.
   *
   * Same contract as `tenantIntegrations` below, absence included.
   */
  tenantMcpServers?: {
    enabled: boolean;
    /** Servers listed ready to connect. Says nothing about how many are connected. */
    count?: number;
  };
  /**
   * Whether this assistant offers connected apps to its tenants.
   *
   * **Absent means "cannot tell", not "no"** — an API older than this field
   * says nothing, and treating silence as a no would hide the connected-apps
   * button from anyone whose deployment has not caught up yet.
   */
  tenantIntegrations?: {
    enabled: boolean;
    /**
     * How many apps the catalogue offers. An upper bound — the listing drops
     * any the provider cannot resolve — and enough to size a placeholder.
     */
    count?: number;
  };
  /**
   * Whether this assistant accepts messages sent while the conversation is
   * busy, queueing them instead of refusing them.
   *
   * **Absent means no**, unlike `tenantIntegrations` above. Promising a queue
   * that does not exist is paid for with a 409 and with the user's text left in
   * the air, so silence is read as the safe answer rather than as the open one.
   */
  messageQueueEnabled?: boolean;
  /** How many messages may wait at once before further sends are refused. */
  maxQueuedMessages?: number;
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
  /** Pinned style of the generated avatar shown when there is no imgUrl. */
  avatarStyle?: AvatarStyle;
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

/**
 * One of the end user's connected accounts for an app.
 *
 * The provider's own identifiers do not travel here beyond `id`, which the
 * client needs in order to name the account it wants disconnected — and which
 * the server re-checks against the caller's tenant on the way back in.
 */
export interface IntegrationAccount {
  id: string;
  status: string;
  connectedAt?: string;
  updatedAt?: string;
  /** True when the account exists but can no longer run tools. */
  needsReconnect?: boolean;
  statusReason?: string;
}

/**
 * One value the end user is asked for before an account can be connected —
 * their API key, the subdomain of their instance.
 *
 * Comes from the provider's own catalogue, so the form is rendered from this
 * rather than from anything app-specific: most apps do not authenticate with
 * credentials Devic holds, and there are hundreds of them.
 */
export interface IntegrationAuthField {
  name: string;
  label: string;
  type: string;
  required: boolean;
  description?: string;
  /** Prefilled — usually a provider endpoint most accounts should keep. */
  default?: string;
  /** Mask it on screen. */
  secret: boolean;
}

/**
 * One way of connecting an app.
 *
 * `redirect` schemes send the user to the provider; the rest are connected
 * with the values they type, without ever leaving the page.
 *
 * There is deliberately no field for the *application's* credentials: the
 * OAuth application belongs to the developer who embedded this widget, is
 * registered once for every tenant, and is never the end user's to supply.
 */
export interface IntegrationAuthScheme {
  /** The provider's own name for it: `OAUTH2`, `API_KEY`, … */
  mode: string;
  /** Credentials for this scheme are held for you — nothing to fill in. */
  composioManaged: boolean;
  redirect: boolean;
  /** What this account supplies. Empty for a scheme that asks nothing. */
  accountFields: IntegrationAuthField[];
  /** The provider's own setup guide, when there is one. */
  guideUrl?: string;
}

/**
 * The answer when connecting needs values that were not sent.
 *
 * `stage` decides who can act on it: `account` is the end user, and the form
 * asks them. `app` is the developer's OAuth application, which the end user
 * cannot register — so that case is shown as "not available yet" instead of a
 * form asking a stranger for someone else's client secret.
 */
export interface IntegrationSetupRequired {
  code: "INTEGRATION_SETUP_REQUIRED";
  message: string;
  toolkit: string;
  authScheme: string;
  stage: "app" | "account";
  fields: IntegrationAuthField[];
  guideUrl?: string;
}

/**
 * An app the assistant offers to its tenants, with the accounts THIS tenant
 * has connected. Never another tenant's.
 */
export interface Integration {
  /** App slug, e.g. `gmail`. */
  app: string;
  name: string;
  description?: string;
  logo?: string;
  /** True when at least one account is active. */
  connected: boolean;
  accounts: IntegrationAccount[];
  /** Event types the developer allows this tenant to switch on. */
  availableTriggers?: string[];
}

// ── MCP servers the end user connects for themselves ──────────────────────

export type TenantMcpAuthMode = "oauth" | "header" | "none";

/** One of the end user's own MCP connections. */
export interface TenantMcpConnection {
  id: string;
  /**
   * What to put in `disabledIntegrations` to have this server sit a message
   * out. Sent by the API so the prefix that separates it from an app slug lives
   * on the server, in one place.
   */
  toggleId?: string;
  name?: string;
  url: string;
  /** The developer's template this came from, when it came from one. */
  templateId?: string;
  authMode?: TenantMcpAuthMode;
  status: "pending_auth" | "active" | "error";
  toolCount?: number;
  tools?: string[];
  lastProbeStatus?: string;
  lastProbeError?: string;
  lastProbeTimestampMs?: number;
  /** Connected for the whole tenant, so every end user of it shares this. */
  shared: boolean;
  /** True when this end user may use it but not change or remove it. */
  readOnly: boolean;
}

/**
 * One row of the MCP panel: either a server the developer offers ready to
 * connect, or one this end user added.
 *
 * A single list rather than two, because that is what the panel draws — keeping
 * "offered" and "connected" apart would leave them out of step for a moment
 * after every connect.
 */
export interface TenantMcpServer {
  source: "template" | "custom";
  templateId?: string;
  name: string;
  url: string;
  description?: string;
  logoUrl?: string;
  authMode?: TenantMcpAuthMode;
  /** Header the credential travels in, for `header` servers. */
  headerName?: string;
  /** Whether the end user may supply their own OAuth application. */
  allowClientCredentials?: boolean;
  /** Null until this tenant connects it. */
  connection: TenantMcpConnection | null;
}

export interface TenantMcpListing {
  offered: boolean;
  /** Whether adding a server of one's own is permitted. */
  allowCustom: boolean;
  limits: { maxServers: number; maxToolsPerServer: number; used: number };
  servers: TenantMcpServer[];
}

/** Credentials the end user supplies when connecting a server. */
export interface TenantMcpAuthInput {
  mode?: TenantMcpAuthMode;
  headerName?: string;
  headerValue?: string;
  upstreamOAuth?: { clientId?: string; clientSecret?: string; scopes?: string[] };
}

/**
 * What connecting answers with.
 *
 * `status: "active"` means it is done. `authorizationUrl` must be opened in a
 * popup. `requiresClientCredentials` means the server has no dynamic client
 * registration and the end user has to register an OAuth application with it
 * themselves, authorising `callbackUrl` as the redirect URI.
 */
export interface TenantMcpConnectResult {
  id: string;
  status: "pending_auth" | "active" | "error";
  toolCount?: number;
  authorizationUrl?: string;
  requiresClientCredentials?: boolean;
  callbackUrl?: string;
  error?: string;
}

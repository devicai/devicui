import type { ChatMessage, ModelInterfaceTool, ChatFile, AgentThreadDto, AgentDto, ToolGroupConfig, WhisperTranscriptionResponse, TenantLimitExceeded } from '../../api/types';
import type { PendingWidgetCall } from '../../hooks/useModelInterface';
import type { AIReference } from '../../provider/types';

/**
 * A suggested message displayed as a quick action button.
 * Supports React nodes for rich content rendering.
 */
export interface SuggestedMessage {
  /** Content to render inside the button (supports React nodes) */
  content: React.ReactNode;
  /** The message text to send when the button is clicked */
  message: string;
}

/**
 * Props passed to a custom prompt box component.
 * The component receives chat actions and state so it can drive the conversation.
 */
export interface CustomPromptBoxProps {
  /**
   * Send a message (optionally with file attachments).
   * Pass `meta.transcriptId` to link the message to a speech-to-text transcript
   * obtained from `transcribeAudio`.
   */
  sendMessage: (
    message: string,
    files?: File[],
    meta?: { transcriptId?: string },
  ) => void;
  /**
   * Transcribe audio to text via the Devic /whisper endpoint.
   * Accepts either a binary (Blob/File, e.g. a recording) or a download URL
   * string. Returns the transcribed text and a `transcriptId` to pass to
   * `sendMessage` so the conversation keeps a link to the audio.
   */
  transcribeAudio: (
    audio: Blob | string,
    options?: {
      language?: string;
      messageUid?: string;
      chatUid?: string;
      tenantId?: string;
    },
  ) => Promise<WhisperTranscriptionResponse>;
  /** Stop the current assistant processing */
  stop: () => void;
  /** Whether the assistant is currently processing / polling for a response */
  isLoading: boolean;
  /** Clear the current conversation and start a new one */
  newConversation: () => void;
  /** Active references created by AIElementWrapper components */
  references: AIReference[];
  /** Remove a single reference by ID */
  removeReference: (id: string) => void;
  /** Clear all references */
  clearReferences: () => void;
  /**
   * Set when the last message was blocked by a tenant/subtenant usage limit.
   * `null` otherwise. Custom prompt boxes can read it to disable input or show
   * their own notice.
   */
  limitExceeded?: TenantLimitExceeded | null;
}

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
   * Suggested messages to display as quick actions.
   * Accepts plain strings or SuggestedMessage objects with ReactNode content.
   */
  suggestedMessages?: (string | SuggestedMessage)[];

  /**
   * Enable file uploads
   * @default false
   */
  enableFileUploads?: boolean;

  /**
   * Enable speech-to-text in the prompt box. Adds a microphone button that
   * records audio, shows a live equalizer while recording, transcribes via the
   * Devic /whisper endpoint and fills the input with the result for review
   * before sending.
   * @default false
   */
  enableSpeechToText?: boolean;

  /**
   * Optional ISO-639-1 language hint for speech-to-text (e.g. 'es', 'en').
   * Improves transcription accuracy when the language is known.
   */
  speechLanguage?: string;

  /**
   * Automatically confirm (transcribe) the voice recording after a short
   * silence, but only once speech has actually been detected. While the
   * silence elapses, an inverted circular progress drains around the confirm
   * button; talking again cancels it. Opt-out: set to false to always require
   * pressing the confirm button manually.
   * @default true
   */
  speechAutoStop?: boolean;

  /**
   * Duration (ms) of the auto-stop circular countdown drawn around the confirm
   * button — i.e. how long the ring takes to drain (and how long the user has
   * to resume talking) before the recording is auto-confirmed.
   * @default 1000
   */
  speechAutoStopCountdownMs?: number;

  /**
   * Continuous silence (ms) that must elapse — after speech was detected —
   * before the auto-stop countdown begins. Lower it to react faster to the end
   * of speech. @default 1000
   */
  speechAutoStopSilenceMs?: number;

  /**
   * Adaptive silence threshold as a fraction of the loudest speech observed
   * (e.g. 0.1 = 10% of peak voice). Calibrates to ambient noise. @default 0.1
   */
  speechAutoStopSilenceRatio?: number;

  /**
   * Absolute floor (0..1) for the adaptive silence threshold, so it never drops
   * so low that background hiss reads as "sound". @default 0.02
   */
  speechAutoStopSilenceLevel?: number;

  /**
   * Absolute floor (0..1) a peak must clear to first count as speech (arms the
   * detector / calibrates the reference loudness). Lower it to pick up quieter
   * voices / softer mics. @default 0.12
   */
  speechAutoStopSpeechLevel?: number;

  /**
   * Enable the hands-free (handoff) conversation loop on the voice input.
   * When on, pressing the mic starts a loop: record → auto-stop transcribes →
   * a short cancellable countdown → the message is sent automatically → once
   * the assistant finishes, listening re-activates. Any click/keystroke during
   * the countdown, or a silent turn, exits the loop.
   * @default false
   */
  speechHandoff?: boolean;

  /**
   * In hands-free mode, the delay (ms) between the transcription being ready
   * and the message being auto-sent — i.e. the cancellable pending countdown.
   * Any click/keystroke during this window cancels the auto-send.
   * @default 1000
   */
  speechHandoffSendDelayMs?: number;

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

  /**
   * Tool group configurations for rendering consecutive tool calls together.
   * When consecutive tool calls match the same group's `tools` array, they are
   * passed as a single array to the group's `renderer` function.
   */
  toolGroups?: ToolGroupConfig[];

  /**
   * Custom stop button content. Shown when the assistant is processing.
   * If not provided, a default square stop icon is rendered.
   */
  stopButtonContent?: React.ReactNode;

  /**
   * Enable debug logging to the browser console.
   * Overrides the provider-level debug setting when provided.
   * @default false
   */
  debug?: boolean;

  /**
   * Persist the selected conversation chatUid in localStorage.
   * On mount, the last selected conversation is restored automatically.
   * The storage key is derived from the assistantId.
   * @default false
   */
  persistConversation?: boolean;

  /**
   * Custom React component to replace the default prompt box (input area).
   * Receives `sendMessage`, `stop`, and `isLoading` props so it can
   * drive the conversation. Takes the full space of the default input area.
   *
   * @example
   * ```tsx
   * customPromptBox: (props) => <MyCustomInput {...props} />
   * ```
   */
  customPromptBox?: (props: CustomPromptBoxProps) => React.ReactNode;

  /**
   * What to show as fallback when a conversation has no name.
   * - 'date': show the creation date/time (default)
   * - 'firstMessage': show the first user message truncated with ellipsis
   * @default 'date'
   */
  conversationPreview?: 'date' | 'firstMessage';

  /**
   * Show a usage bar above the input with the current tenant/subtenant usage
   * (most utilized window). Requires a `tenantId` (and reads it via the public
   * read-only `/api/v1/tenant-usage` endpoint).
   * - `true`: the bar is always visible.
   * - `'onDemand'`: a small "Usage" toggle button is shown; the bar appears on click.
   * - `false` (default): no usage bar.
   *
   * Renders nothing when the tenant has no usage limits configured.
   * @default false
   */
  showUsageBar?: boolean | 'onDemand';

  /**
   * Restrict the usage bar to a single metric ('tokens' or 'cost'). When
   * omitted, the most utilized window across all metrics is shown.
   */
  usageBarMetric?: 'tokens' | 'cost';

  /**
   * Hide the default banner shown above the input when a message is blocked by
   * a usage limit. Use together with `useDevicChat().limitExceeded` (or
   * `onError`) to render your own UI.
   * @default false
   */
  hideLimitBanner?: boolean;

  /**
   * Custom renderer for the usage-limit banner. Receives the limit details and
   * returns the node rendered above the input (replacing the default banner).
   * The input is disabled regardless while the limit is active.
   */
  limitBannerRenderer?: (limit: TenantLimitExceeded) => React.ReactNode;
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
  conversationPreview?: 'date' | 'firstMessage';
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
   * Subtenant ID (overrides provider)
   */
  subtenantId?: string;

  /**
   * Subtenant metadata (overrides provider)
   */
  subtenantMetadata?: Record<string, any>;

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
   * Custom file upload handler. When provided, replaces the default
   * upload to Devic API. Receives the raw File objects selected by
   * the user and must return an array of ChatFile with downloadUrl set.
   */
  onFileUpload?: (files: File[]) => Promise<ChatFile[]>;

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
  suggestedMessages?: (string | SuggestedMessage)[];
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
  /** Tool group configurations for grouped rendering */
  toolGroups?: ToolGroupConfig[];
  /** Pending widget tool calls to render inline in the message thread */
  pendingInlineWidgets?: PendingWidgetCall[];
  /** Called when a widget submits its response */
  onSubmitWidget?: (toolCallId: string, response: any) => void;
  /** Called when a widget cancels */
  onCancelWidget?: (toolCallId: string, reason?: string) => void;
}

/**
 * Props for ChatInput component
 */
export interface ChatInputProps {
  onSend: (
    message: string,
    files?: File[],
    meta?: { transcriptId?: string },
  ) => void;
  disabled?: boolean;
  placeholder?: string;
  enableFileUploads?: boolean;
  allowedFileTypes?: AllowedFileTypes;
  maxFileSize?: number;
  /** Enable the speech-to-text microphone control. */
  enableSpeechToText?: boolean;
  /** ISO-639-1 language hint for speech-to-text. */
  speechLanguage?: string;
  /** Optional tenant id sent with the /whisper transcription request. */
  speechTenantId?: string;
  /**
   * Auto-confirm the recording after a short silence (only once speech has been
   * detected). Set to false to require pressing the confirm button. @default true
   */
  speechAutoStop?: boolean;
  /** Duration (ms) of the auto-stop circular countdown. @default 1000 */
  speechAutoStopCountdownMs?: number;
  /** Continuous silence (ms) after speech before the auto-stop countdown. @default 1000 */
  speechAutoStopSilenceMs?: number;
  /** Adaptive silence threshold as a fraction of peak voice. @default 0.1 */
  speechAutoStopSilenceRatio?: number;
  /** Absolute floor (0..1) for the adaptive silence threshold. @default 0.02 */
  speechAutoStopSilenceLevel?: number;
  /** Absolute floor (0..1) a peak must clear to count as speech. @default 0.12 */
  speechAutoStopSpeechLevel?: number;
  /** Enable hands-free (handoff) conversation loop on the mic. @default false */
  speechHandoff?: boolean;
  /** Delay (ms) in handoff from transcription ready to auto-send. @default 1000 */
  speechHandoffSendDelayMs?: number;
  /** API key used to call the /whisper endpoint (overrides provider). */
  apiKey?: string;
  /** Base URL used to call the /whisper endpoint (overrides provider). */
  baseUrl?: string;
  sendButtonContent?: React.ReactNode;
  /** Message shown when input is disabled due to handoff */
  disabledMessage?: string;
  /** Whether the assistant is currently processing (shows stop button) */
  isProcessing?: boolean;
  /** Callback to stop the current processing */
  onStop?: () => void;
  /** Custom stop button content */
  stopButtonContent?: React.ReactNode;
  /** Pending widget tool call to render replacing the input (render: 'input') */
  pendingInputWidget?: PendingWidgetCall | null;
  /** Called when the input widget submits */
  onSubmitWidget?: (toolCallId: string, response: any) => void;
  /** Called when the input widget cancels */
  onCancelWidget?: (toolCallId: string, reason?: string) => void;
  /** Active references displayed as chips above the textarea */
  references?: AIReference[];
  /** Called when the user removes a reference chip */
  onRemoveReference?: (id: string) => void;
  /** Usage bar node rendered at the top of the input area (above the textarea). */
  usageBar?: React.ReactNode;
  /**
   * Usage-limit banner node rendered above the textarea when a message was
   * blocked by a usage limit. When present, the input is disabled.
   */
  limitBanner?: React.ReactNode;
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

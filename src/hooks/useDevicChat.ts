import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useOptionalDevicContext } from '../provider';
import type { TenantMetadata, SubtenantMetadata } from '../provider';
import { DevicApiClient, DevicApiError } from '../api/client';
import { usePolling, resolvePollingInterval } from './usePolling';
import { useModelInterface, type PendingWidgetCall } from './useModelInterface';
import { createLogger } from '../utils/logger';
import { useAssistantInfo } from '../api/assistantInfo';
import type {
  ChatMessage,
  ChatFile,
  ModelInterfaceTool,
  QueueDisposition,
  RealtimeChatHistory,
  RealtimeStatus,
  RecalledMemoryRecord,
  TenantLimitExceeded,
} from '../api/types';

/**
 * Cadence for the handoff watch, which only waits for the parent thread to
 * leave `handed_off` and so does not need the main conversation's rhythm.
 * A configured `pollingInterval` still wins over it.
 */
const DEFAULT_HANDOFF_POLL_INTERVAL_MS = 5000;

/**
 * How many polls the conversation may read as finished while it still owes an
 * answer to something queued, before the wait is given up.
 *
 * The window is real: a run liquidates, and the follow-up run that drains the
 * queue has not marked itself as processing yet. Bounded so a message that
 * never comes back cannot poll forever.
 */
const QUEUE_HANDOVER_GRACE_TICKS = 60;

/** Messages are matched to their optimistic copies by text, so it is normalized. */
const normalizeText = (text?: string): string => (text ?? '').trim();

export interface UseDevicChatOptions {
  /**
   * Assistant identifier
   */
  assistantId: string;

  /**
   * Existing chat UID to continue a conversation
   */
  chatUid?: string;

  /**
   * API key (overrides provider context)
   */
  apiKey?: string;

  /**
   * Base URL (overrides provider context)
   */
  baseUrl?: string;

  /**
   * Tenant ID for multi-tenant environments
   */
  tenantId?: string;

  /**
   * Tenant metadata (e.g. { name, email, imageUrl })
   */
  tenantMetadata?: TenantMetadata;

  /**
   * Subtenant ID identifying a user/entity inside the tenant
   */
  subtenantId?: string;

  /**
   * Subtenant metadata (e.g. { id, name, email, imageUrl })
   */
  subtenantMetadata?: SubtenantMetadata;

  /**
   * Tags applied to the conversation. Sent as the top-level `tags` of each
   * message (distinct from metadata). Falls back to the DevicProvider's `tags`
   * and is merged (deduped) with any per-message tags passed to `sendMessage`.
   */
  tags?: string[];

  /**
   * Tools enabled from the assistant's configured tool groups
   */
  enabledTools?: string[];

  /**
   * Apps the end user connected that should sit out the messages sent from
   * here, by slug (`["gmail"]`).
   *
   * A deny list over their own connected apps, not over the assistant's tools:
   * what is not named stays available. Sent with every message while it is set,
   * so it lasts as long as the caller keeps it set — the server keeps nothing
   * and the account is never disconnected.
   */
  disabledIntegrations?: string[];

  /**
   * Client-side tools for model interface protocol
   */
  modelInterfaceTools?: ModelInterfaceTool[];

  /**
   * How often (ms) the conversation in progress is polled for new content.
   * Overrides the DevicProvider's `pollingInterval`. Values below 250 ms are
   * clamped.
   * @default 1000
   */
  pollingInterval?: number;

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
   * Callback when a new chat is created
   */
  onChatCreated?: (chatUid: string) => void;

  /**
   * Custom file upload handler. When provided, replaces the default
   * upload to Devic API. Receives the raw File objects and must return
   * an array of ChatFile with downloadUrl set.
   */
  onFileUpload?: (files: File[]) => Promise<ChatFile[]>;

  /**
   * Whether this assistant takes messages while the conversation is busy.
   *
   * Left unset it is resolved from the assistant itself (`messageQueueEnabled`),
   * through the shared per-assistant lookup — one request, shared with the
   * avatar and the connected-apps control, whichever asks first. Pass a boolean
   * to skip the lookup entirely or to override what it says.
   *
   * With it off the input closes while the assistant answers, as it always has.
   * With it on, a message written mid-answer is accepted and joins the
   * assistant's next turn.
   */
  messageQueue?: boolean;

  /**
   * Enable debug logging to the browser console.
   * Overrides the provider-level debug setting when provided.
   * @default false
   */
  debug?: boolean;
}

/**
 * What became of a send.
 *
 * `queued` is an acceptance, not a failure: the message is on the conversation
 * and will be answered later. `rejected` is the opposite — nothing was
 * accepted, and the caller still holds the only copy of what the user wrote.
 */
export type SendMessageResult =
  | { queued: true; queuePosition: number; willProcess: QueueDisposition }
  | { queued: false }
  | {
      rejected: true;
      /**
       * `chat_busy`: this assistant does not queue and is working.
       * `queue_full`: it does, and the queue is at its configured ceiling.
       * `error`: anything else, already reported through `error`/`onError`.
       */
      reason: 'chat_busy' | 'queue_full' | 'error';
      message: string;
      /** What the user wrote, so it can be restored. */
      restoredText: string;
    };

export interface StopResult {
  /** Text of the queued messages the stop threw away, joined by newlines. */
  restoredText?: string;
  /** How many were discarded. */
  discarded: number;
}

export interface UseDevicChatResult {
  /**
   * Current chat messages
   */
  messages: ChatMessage[];

  /**
   * Current chat UID
   */
  chatUid: string | null;

  /**
   * Whether a message is being processed
   */
  isLoading: boolean;

  /**
   * Current status
   */
  status: RealtimeStatus | 'idle';

  /**
   * Last error
   */
  error: Error | null;

  /**
   * Set when the last message was blocked by a tenant/subtenant usage limit
   * (HTTP 429 / realtime status `limit_exceeded`). Carries the blocking rule,
   * current vs. limit and when the window resets. `null` while not limited.
   * Cleared when a new message is sent or the chat is cleared.
   */
  limitExceeded: TenantLimitExceeded | null;

  /**
   * Structured long-term-memory recall events of the conversation, streamed
   * in while the assistant is still processing (via the realtime poll) and
   * hydrated from the persisted history on load. Empty for assistants
   * without memory.
   */
  recalledMemories: RecalledMemoryRecord[];

  /**
   * Whether the assistant has handed off to a subagent
   */
  handedOff: boolean;

  /**
   * The subthread ID when a handoff is active
   */
  handedOffSubThreadId: string | null;

  /**
   * Send a message
   */
  sendMessage: (
    message: string,
    options?: {
      files?: File[];
      metadata?: Record<string, any>;
      /** Id of a speech-to-text transcript that seeded this message. */
      transcriptId?: string;
      /** Per-message tags, merged (deduped) with the resolved conversation tags. */
      tags?: string[];
      /**
       * Connected apps to leave out of this one message, by slug. Replaces the
       * hook's own `disabledIntegrations` rather than adding to it, so a caller
       * can send one message with everything on by passing `[]`.
       */
      disabledIntegrations?: string[];
    }
  ) => Promise<SendMessageResult>;

  /**
   * Clear the chat and start a new conversation
   */
  clearChat: () => void;

  /**
   * Load an existing chat
   */
  loadChat: (chatUid: string) => Promise<void>;

  /**
   * Called when the handoff subagent completes.
   * Triggers reload of full chat content.
   */
  onHandoffCompleted: () => void;

  /**
   * How many messages this conversation has accepted but not yet shown to the
   * model. Includes anything queued through another channel, so it is the
   * conversation's queue and not this client's.
   */
  queuedCount: number;

  /**
   * Whether this assistant takes messages while it is busy — resolved from the
   * assistant, or from the `messageQueue` option when given. False until the
   * lookup settles: an input that opens and then closes is worse than one that
   * opens a beat late.
   */
  queueEnabled: boolean;

  /**
   * Stop the current conversation processing.
   *
   * Returns the text of anything the stop discarded, so the caller can put it
   * back where the user wrote it — a stop should not be the way someone's
   * typing disappears.
   */
  stopChat: () => Promise<StopResult>;

  /**
   * Pending tool calls that require user interaction via a response widget
   */
  pendingWidgetCalls: PendingWidgetCall[];

  /**
   * Submit a response for a pending widget tool call.
   * Sends the response to the API and resumes the conversation.
   */
  submitWidgetResponse: (toolCallId: string, response: any) => Promise<void>;

  /**
   * Cancel a pending widget tool call.
   * Sends an error response so the model can continue.
   */
  cancelWidgetCall: (toolCallId: string, reason?: string) => Promise<void>;
}

/**
 * Main hook for managing chat with a Devic assistant
 *
 * @example
 * ```tsx
 * const {
 *   messages,
 *   isLoading,
 *   sendMessage,
 * } = useDevicChat({
 *   assistantId: 'my-assistant',
 *   modelInterfaceTools: [
 *     {
 *       toolName: 'get_user_location',
 *       schema: { ... },
 *       callback: async () => ({ lat: 40.7, lng: -74.0 })
 *     }
 *   ],
 *   onMessageReceived: (msg) => console.log('Received:', msg),
 * });
 * ```
 */
export function useDevicChat(options: UseDevicChatOptions): UseDevicChatResult {
  const {
    assistantId,
    chatUid: initialChatUid,
    apiKey: propsApiKey,
    baseUrl: propsBaseUrl,
    tenantId,
    tenantMetadata,
    subtenantId,
    subtenantMetadata,
    tags,
    enabledTools,
    disabledIntegrations,
    modelInterfaceTools = [],
    pollingInterval: propsPollingInterval,
    onMessageSent,
    onMessageReceived,
    onToolCall,
    onError,
    onChatCreated,
    onFileUpload,
    messageQueue,
    debug: propsDebug,
  } = options;

  // Get context (may be null if not wrapped in provider)
  const context = useOptionalDevicContext();

  // Resolve configuration
  const apiKey = propsApiKey || context?.apiKey;
  const getTenantSession = context?.getTenantSession;
  const onSessionExpired = context?.onSessionExpired;
  const baseUrl = propsBaseUrl || context?.baseUrl || 'https://api.devic.ai';
  const resolvedTenantId = tenantId || context?.tenantId;
  const resolvedTenantMetadata = { ...context?.tenantMetadata, ...tenantMetadata };
  const resolvedSubtenantId = subtenantId || context?.subtenantId;
  const resolvedSubtenantMetadata = {
    ...context?.subtenantMetadata,
    ...subtenantMetadata,
  };
  // Provider tags + hook tags, deduped. Per-message tags are merged at send time.
  const resolvedTags = useMemo(
    () => Array.from(new Set([...(context?.tags ?? []), ...(tags ?? [])])),
    [context?.tags, tags]
  );
  const pollingInterval = resolvePollingInterval(
    propsPollingInterval,
    context?.pollingInterval
  );
  const handoffPollingInterval = resolvePollingInterval(
    propsPollingInterval,
    context?.pollingInterval,
    DEFAULT_HANDOFF_POLL_INTERVAL_MS
  );
  const debug = propsDebug ?? context?.debug ?? false;
  const log = useMemo(() => createLogger(debug), [debug]);
  const logRef = useRef(log);
  logRef.current = log;

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatUid, setChatUid] = useState<string | null>(initialChatUid || null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<RealtimeStatus | 'idle'>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [limitExceeded, setLimitExceeded] = useState<TenantLimitExceeded | null>(
    null
  );

  // Long-term-memory recall events of the conversation. The realtime blob
  // only carries the in-flight run's records, so incoming batches merge (by
  // uid) instead of replacing — earlier runs' recalls stay visible.
  const [recalledMemories, setRecalledMemories] = useState<RecalledMemoryRecord[]>([]);
  const mergeRecalledMemories = useCallback(
    (incoming?: RecalledMemoryRecord[]) => {
      if (!incoming?.length) return;
      setRecalledMemories((prev) => {
        const known = new Set(prev.map((r) => r.uid));
        const fresh = incoming.filter((r) => !known.has(r.uid));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    },
    []
  );

  // Handoff state
  const [handedOff, setHandedOff] = useState(false);
  const [handedOffSubThreadId, setHandedOffSubThreadId] = useState<string | null>(null);
  const handoffPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Polling state
  const [shouldPoll, setShouldPoll] = useState(false);

  // Keep a ref to chatUid so async callbacks always read the latest value
  const chatUidRef = useRef(chatUid);
  chatUidRef.current = chatUid;

  // Read by `sendMessage`, which must not restate the state of a run already in
  // flight — its own callback identity would otherwise carry a stale value.
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;

  // Two messages sent inside the same millisecond would otherwise share a uid,
  // which the queue makes easy to do.
  const optimisticSeqRef = useRef(0);

  // Refs for callbacks
  const onMessageReceivedRef = useRef(onMessageReceived);
  const onErrorRef = useRef(onError);
  const onChatCreatedRef = useRef(onChatCreated);

  useEffect(() => {
    onMessageReceivedRef.current = onMessageReceived;
    onErrorRef.current = onError;
    onChatCreatedRef.current = onChatCreated;
  });

  // Create API client
  const clientRef = useRef<DevicApiClient | null>(null);
  if (!clientRef.current && (apiKey || getTenantSession)) {
    clientRef.current = new DevicApiClient({ apiKey, baseUrl, getTenantSession, onSessionExpired });
  }

  // Update client config if it changes
  useEffect(() => {
    if (clientRef.current && apiKey) {
      clientRef.current.setConfig({ apiKey, baseUrl });
    }
  }, [apiKey, baseUrl]);

  // --- Message queue --------------------------------------------------------

  /**
   * Messages accepted by this conversation that the model has not seen yet.
   * Taken from the poll, so it counts whatever else queued on the conversation
   * too — another tab, or the same person writing from another channel.
   */
  const [queuedCount, setQueuedCount] = useState(0);

  /**
   * When something was queued from here that has not been answered yet.
   *
   * Deliberately not a list of the texts sent: a drain can merge several queued
   * messages into a single user turn, so what comes back is not what went out
   * and matching them by text would wait forever. What is being waited for is an
   * answer, and an assistant message written after the message was accepted is
   * that answer.
   */
  const awaitingAnswerSinceRef = useRef<number | null>(null);
  const queueGraceTicksRef = useRef(0);

  const rememberAwaiting = useCallback(() => {
    awaitingAnswerSinceRef.current = Date.now();
  }, []);

  const resetQueueState = useCallback(() => {
    awaitingAnswerSinceRef.current = null;
    queueGraceTicksRef.current = 0;
    setQueuedCount(0);
  }, []);

  /**
   * Asked for as soon as the hook is alive, rather than when the first run
   * starts: the answer decides whether the input stays open while the assistant
   * works, and resolving it late means the box visibly closes and reopens on the
   * first message of every session. One request, shared with everything else
   * that asks about this assistant. Passing `messageQueue` skips it entirely.
   */
  const queueLookup = useAssistantInfo({
    assistantId,
    client: clientRef.current,
    baseUrl,
    credential: apiKey || 'session',
    enabled: messageQueue === undefined,
  });

  /**
   * Absent means no. An assistant that has not answered yet, or an API too old
   * to carry the field, leaves the input closed while it works — the same thing
   * it did before this existed. Opening it on a maybe would promise a queue the
   * conversation then refuses.
   */
  const queueEnabled =
    messageQueue ??
    (queueLookup.settled &&
      queueLookup.assistant?.messageQueueEnabled === true);

  // Resume chat state based on realtime status.
  // Called after loading chat history to detect in-progress conversations.
  const resumeFromRealtimeStatus = useCallback(
    async (targetChatUid: string) => {
      if (!clientRef.current) return;
      try {
        const realtime = await clientRef.current.getRealtimeHistory(assistantId, targetChatUid);
        logRef.current.log('[useDevicChat] resumeFromRealtimeStatus:', realtime.status);

        // Update messages with realtime data (may be fresher than static history)
        const queuedOnServer = (realtime.pendingUserMessages ?? []).map((m) => ({
          ...m,
          queued: true,
        }));
        if (realtime.chatHistory?.length || queuedOnServer.length) {
          setMessages([...(realtime.chatHistory ?? []), ...queuedOnServer]);
        }
        mergeRecalledMemories(realtime.recalledMemories);
        setStatus(realtime.status);
        setQueuedCount(realtime.queuedMessages ?? 0);

        if (realtime.status === 'processing') {
          // Chat is still processing — resume polling
          setIsLoading(true);
          setShouldPoll(true);
        } else if (realtime.status === 'waiting_for_tool_response') {
          // Chat is waiting for tool response — resume polling to trigger tool handling
          setIsLoading(true);
          setShouldPoll(true);
        } else if (realtime.status === 'handed_off') {
          // Chat has an active handoff
          setIsLoading(true);
          setHandedOff(true);
          const subThreadId = realtime.handedOffSubThreadId || null;
          logRef.current.log('[useDevicChat] Resuming handoff state:', { subThreadId });
          if (subThreadId) {
            setHandedOffSubThreadId(subThreadId);
          }
        } else if ((realtime.queuedMessages ?? 0) > 0) {
          // The run settled, but the conversation still owes an answer to
          // something queued — reopened on a conversation whose follow-up run
          // has not started yet. Watch it until the queue is served.
          setIsLoading(true);
          setShouldPoll(true);
        } else {
          // completed or error — just stop
          setIsLoading(false);
        }
      } catch (err) {
        // If realtime fetch fails (e.g. chat has no realtime entry), just stay idle
        logRef.current.warn('[useDevicChat] resumeFromRealtimeStatus failed:', err);
        setIsLoading(false);
      }
    },
    [assistantId, mergeRecalledMemories]
  );

  // Load initial chat history if chatUid prop is provided
  // This runs once on mount (or when initialChatUid changes) to fetch existing conversation
  const initialChatLoadedRef = useRef(false);
  useEffect(() => {
    if (initialChatUid && clientRef.current && !initialChatLoadedRef.current) {
      initialChatLoadedRef.current = true;

      const loadInitialChat = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const history = await clientRef.current!.getChatHistory(
            assistantId,
            initialChatUid,
            { tenantId: resolvedTenantId }
          );
          setMessages(history.chatContent);
          mergeRecalledMemories(history.recalledMemories);
          setChatUid(initialChatUid);

          // Check realtime status to resume in-progress conversations
          await resumeFromRealtimeStatus(initialChatUid);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          setError(error);
          onErrorRef.current?.(error);
          setIsLoading(false);
        }
      };

      loadInitialChat();
    }
  }, [initialChatUid, assistantId, resolvedTenantId, resumeFromRealtimeStatus]);

  // Model interface hook
  const {
    toolSchemas,
    handleToolCalls,
    extractPendingToolCalls,
  } = useModelInterface({
    tools: modelInterfaceTools,
    onToolExecute: onToolCall,
  });

  // Pending widget calls awaiting user interaction
  const [pendingWidgetCalls, setPendingWidgetCalls] = useState<PendingWidgetCall[]>([]);
  const pendingWidgetCallsRef = useRef<PendingWidgetCall[]>([]);
  useEffect(() => {
    pendingWidgetCallsRef.current = pendingWidgetCalls;
  }, [pendingWidgetCalls]);

  // Polling hook - uses callbacks for side effects, return value not needed
  logRef.current.log('[useDevicChat] Render - shouldPoll:', shouldPoll, 'chatUid:', chatUid);
  usePolling(
    shouldPoll ? chatUid : null,
    async () => {
      logRef.current.log('[useDevicChat] fetchFn called, chatUid:', chatUid);
      if (!clientRef.current || !chatUid) {
        throw new Error('Cannot poll without client or chatUid');
      }
      const result = await clientRef.current.getRealtimeHistory(assistantId, chatUid);
      logRef.current.log('[useDevicChat] getRealtimeHistory result:', result);
      return result;
    },
    {
      interval: pollingInterval,
      enabled: shouldPoll,
      stopStatuses: [
        'completed',
        'error',
        'waiting_for_tool_response',
        'handed_off',
        'limit_exceeded',
      ],
      onUpdate: async (data: RealtimeChatHistory) => {
        logRef.current.log('[useDevicChat] onUpdate called, status:', data.status);

        // An assistant message written after something was queued from here is
        // the answer that was being waited for.
        const awaitingSince = awaitingAnswerSinceRef.current;
        if (
          awaitingSince !== null &&
          (data.queuedMessages ?? 0) === 0 &&
          (data.chatHistory ?? []).some(
            (m) => m.role === 'assistant' && (m.timestamp ?? 0) > awaitingSince
          )
        ) {
          awaitingAnswerSinceRef.current = null;
        }

        // Merge realtime data with optimistic messages.
        // When a server user message matches an optimistic one by text, adopt the
        // optimistic uid so React's key stays stable (avoids unmount/remount flicker).
        setMessages((prev) => {
          // A queue of uids per text rather than one: two identical messages are
          // two messages, and pairing both with the same optimistic copy would
          // drop one of them from the conversation.
          const optimisticUserByText = new Map<string, string[]>();
          prev
            .filter((m) => m.role === 'user' && m.uid.startsWith('temp-'))
            .forEach((m) => {
              const key = normalizeText(m.content?.message);
              const bucket = optimisticUserByText.get(key);
              if (bucket) bucket.push(m.uid);
              else optimisticUserByText.set(key, [m.uid]);
            });

          const adoptedTempUids = new Set<string>();
          const adopt = (m: ChatMessage): ChatMessage => {
            if (m.role !== 'user') return m;
            const tempUid = optimisticUserByText
              .get(normalizeText(m.content?.message))
              ?.shift();
            if (!tempUid) return m;
            adoptedTempUids.add(tempUid);
            // Keep the server uid around: recall anchors reference it.
            return { ...m, uid: tempUid, serverUid: m.uid };
          };

          const merged = data.chatHistory.map(adopt);
          // Accepted, but not part of the conversation yet. Drawn between the
          // history and the optimistic ones, which is where they land once a
          // turn takes them. The copy is the server's, so it survives a reload —
          // where the API does not return them, this is empty and the optimistic
          // ones kept below stand in.
          const queued = (data.pendingUserMessages ?? []).map((m) => ({
            ...adopt(m),
            queued: true,
          }));

          // Which of this client's own queued bubbles to keep drawing.
          //
          // Matching them to the history by text does not work: a drain can
          // merge several queued messages into one user turn, and an optimistic
          // copy that never finds its pair would sit there marked as queued for
          // the rest of the conversation. The server's queue is the authority,
          // and these are kept only where it cannot speak for them:
          //   - too recently accepted for this poll to have seen them;
          //   - counted by `queuedMessages` but not itemised, which is what an
          //     API without `pendingUserMessages` reports.
          const optimisticQueued = prev.filter(
            (m) => m.queued && m.uid.startsWith('temp-')
          );
          const tooRecent = Date.now() - pollingInterval;
          const keptQueued = new Set(
            optimisticQueued
              .filter((m) => (m.queuedAt ?? 0) > tooRecent)
              .map((m) => m.uid)
          );
          let unitemised =
            (data.queuedMessages ?? queued.length) - queued.length - keptQueued.size;
          for (let i = optimisticQueued.length - 1; i >= 0 && unitemised > 0; i--) {
            if (keptQueued.has(optimisticQueued[i].uid)) continue;
            keptQueued.add(optimisticQueued[i].uid);
            unitemised -= 1;
          }

          const mergedUIDs = new Set(
            [...merged, ...queued].map((m) => m.uid)
          );
          const optimistic = prev.filter(
            (m) =>
              !mergedUIDs.has(m.uid) &&
              !adoptedTempUids.has(m.uid) &&
              (!m.queued || keptQueued.has(m.uid))
          );

          return [...merged, ...queued, ...optimistic];
        });
        setQueuedCount(data.queuedMessages ?? 0);
        // Surface recall events while the run is still processing, so the
        // "recalled memories" strip shows before the first response lands.
        mergeRecalledMemories(data.recalledMemories);
        setStatus(data.status);

        // Notify about new messages
        const lastMessage = data.chatHistory[data.chatHistory.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          onMessageReceivedRef.current?.(lastMessage);
        }

        // Handle model interface - check for pending tool calls
        if (data.status === 'waiting_for_tool_response' || data.pendingToolCalls?.length) {
          await handlePendingToolCalls(data);
        }
      },
      holdOpen: (data) => {
        // Only `completed` is worth waiting on. An error, a usage limit or a
        // gate mean something else is going on, and holding the poll open would
        // just be watching a conversation that is not coming back.
        const owed =
          (data.queuedMessages ?? 0) > 0 ||
          awaitingAnswerSinceRef.current !== null;
        if (!owed || data.status !== 'completed') {
          queueGraceTicksRef.current = 0;
          return false;
        }
        queueGraceTicksRef.current += 1;
        if (queueGraceTicksRef.current <= QUEUE_HANDOVER_GRACE_TICKS) return true;
        // Nothing came back in time: stop pretending it will.
        logRef.current.warn(
          '[useDevicChat] queue handover window expired, stopping the watch'
        );
        awaitingAnswerSinceRef.current = null;
        return false;
      },
      onStop: (data) => {
        logRef.current.log('[useDevicChat] onStop called, status:', data?.status);
        setShouldPoll(false);
        queueGraceTicksRef.current = 0;

        if (data?.status === 'limit_exceeded') {
          // The message was blocked by a tenant/subtenant usage limit before
          // reaching the LLM. Surface the details so the UI can show a banner.
          setIsLoading(false);
          const details: TenantLimitExceeded = data.limitExceeded || {
            message: 'Usage limit reached.',
          };
          setLimitExceeded(details);
          const err = new Error(
            details.message || 'Usage limit reached.'
          ) as Error & { errorType?: string; details?: TenantLimitExceeded };
          err.errorType = 'TENANT_LIMIT_EXCEEDED';
          err.details = details;
          setError(err);
          onErrorRef.current?.(err);
        } else if (data?.status === 'error') {
          setIsLoading(false);
          const err = new Error('Chat processing failed');
          setError(err);
          onErrorRef.current?.(err);
        } else if (data?.status === 'completed') {
          setIsLoading(false);
        } else if (data?.status === 'handed_off') {
          // Subagent is working — keep isLoading true so the UI stays in loading state.
          // Set handoff state directly from the realtime status.
          setHandedOff(true);

          const subThreadId = data.handedOffSubThreadId || null;
          logRef.current.log('[useDevicChat] Handoff state set:', { handedOff: true, subThreadId });
          if (subThreadId) {
            setHandedOffSubThreadId(subThreadId);
          }
        }
        // Note: waiting_for_tool_response is handled in onUpdate to avoid double execution
      },
      onError: (err) => {
        logRef.current.error('[useDevicChat] onError called:', err);
        setError(err);
        setIsLoading(false);
        setShouldPoll(false);
        onErrorRef.current?.(err);
      },
      debug,
    }
  );

  // Handle pending tool calls from model interface
  const handlePendingToolCalls = useCallback(
    async (data: RealtimeChatHistory) => {
      if (!clientRef.current || !chatUid) return;

      // Get pending tool calls
      const pendingCalls = data.pendingToolCalls || extractPendingToolCalls(data.chatHistory);

      if (pendingCalls.length === 0) return;

      try {
        // Execute client-side tools (partitioned into immediate responses and widget-driven)
        const { responses, widgetCalls } = await handleToolCalls(pendingCalls);

        // Queue widget-driven tool calls for user interaction
        if (widgetCalls.length > 0) {
          const existingIds = new Set(pendingWidgetCallsRef.current.map((c) => c.toolCall.id));
          const deduped = widgetCalls.filter((c) => !existingIds.has(c.toolCall.id));
          const next = [...pendingWidgetCallsRef.current, ...deduped];
          pendingWidgetCallsRef.current = next;
          setPendingWidgetCalls(next);
          // Stop polling while we wait for the user to submit the widget response.
          // The widget submission will re-trigger polling via submitWidgetResponse.
          setShouldPoll(false);
          setIsLoading(false);
        }

        if (responses.length > 0) {
          // Send tool responses back to the API, restating the tools so the
          // continuation keeps them on offer
          await clientRef.current.sendToolResponses(
            assistantId,
            chatUid,
            responses,
            toolSchemas
          );

          // Only resume polling if no widgets are blocking
          if (widgetCalls.length === 0) {
            setShouldPoll(true);
            setIsLoading(true);
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onErrorRef.current?.(error);
      }
    },
    [chatUid, assistantId, handleToolCalls, extractPendingToolCalls, toolSchemas]
  );

  // Send a message
  const sendMessage = useCallback(
    async (
      message: string,
      sendOptions?: {
        files?: File[];
        metadata?: Record<string, any>;
        transcriptId?: string;
        tags?: string[];
        disabledIntegrations?: string[];
      }
    ): Promise<SendMessageResult> => {
      if (!clientRef.current) {
        const err = new Error(
          'API client not configured. Please provide an API key.'
        );
        setError(err);
        onErrorRef.current?.(err);
        return { rejected: true, reason: 'error', message: err.message, restoredText: message };
      }

      // Whether something was already running when this was written. If it was,
      // this send must not restate it: turning the indicator on and off around a
      // message that merely joined a queue would report on a run it has nothing
      // to do with — and a refusal would then stop an indicator for a run that
      // is still perfectly alive.
      const wasBusy = isLoadingRef.current;

      if (!wasBusy) {
        setIsLoading(true);
        setStatus('processing');
      }
      setError(null);
      setLimitExceeded(null);

      // Add user message optimistically (show file names before upload)
      const userMessage: ChatMessage = {
        uid: `temp-${Date.now()}-${optimisticSeqRef.current++}`,
        role: 'user',
        content: {
          message,
          files: sendOptions?.files?.map((f) => ({
            name: f.name,
            url: '',
            type: f.type.split('/')[0] || 'other',
          })),
        },
        timestamp: Date.now(),
        ...(sendOptions?.transcriptId && {
          transcriptId: sendOptions.transcriptId,
        }),
      };

      setMessages((prev) => [...prev, userMessage]);
      onMessageSent?.(userMessage);

      try {
        // Upload files if provided
        let uploadedFiles: ChatFile[] | undefined;
        if (sendOptions?.files && sendOptions.files.length > 0) {
          logRef.current.log('[useDevicChat] Uploading files...');
          if (onFileUpload) {
            // Use custom upload handler
            uploadedFiles = await onFileUpload(sendOptions.files);
          } else {
            // Default: upload via Devic API
            const uploadResults = await Promise.all(
              sendOptions.files.map((file) => clientRef.current!.uploadFile(file))
            );
            uploadedFiles = uploadResults.map((r) => ({
              name: r.name,
              downloadUrl: r.downloadUrl,
              fileType: r.fileType as ChatFile['fileType'],
            }));
          }
          logRef.current.log('[useDevicChat] Files uploaded:', uploadedFiles);

          // Update optimistic message with download URLs
          setMessages((prev) =>
            prev.map((m) =>
              m.uid === userMessage.uid
                ? {
                    ...m,
                    content: {
                      ...m.content,
                      files: uploadedFiles!.map((f) => ({
                        name: f.name,
                        url: f.downloadUrl || '',
                        type: f.fileType || 'other',
                      })),
                    },
                  }
                : m
            )
          );
        }

        // Build request DTO
        const hasSubtenantMetadata =
          resolvedSubtenantMetadata &&
          Object.keys(resolvedSubtenantMetadata).length > 0;
        const dto = {
          message,
          chatUid: chatUid || undefined,
          files: uploadedFiles,
          metadata: {
            ...resolvedTenantMetadata,
            ...(hasSubtenantMetadata && {
              subtenantMetadata: resolvedSubtenantMetadata,
            }),
            ...sendOptions?.metadata,
          },
          tenantId: resolvedTenantId,
          ...(resolvedSubtenantId && { subtenantId: resolvedSubtenantId }),
          // Conversation tags: provider + hook + per-message, deduped
          ...(() => {
            const merged = Array.from(
              new Set([...resolvedTags, ...(sendOptions?.tags ?? [])])
            );
            return merged.length > 0 ? { tags: merged } : {};
          })(),
          enabledTools,
          // The end user's own apps that sit this message out. Sent only when
          // some are switched off: an older API ignores the field, and there is
          // no reason to put an empty array in every request.
          ...(() => {
            const off = sendOptions?.disabledIntegrations ?? disabledIntegrations;
            return off?.length ? { disabledIntegrations: off } : {};
          })(),
          // Include model interface tools if any
          ...(toolSchemas.length > 0 && { tools: toolSchemas }),
          // Link to the speech-to-text transcript that seeded this message, if any
          ...(sendOptions?.transcriptId && { transcriptId: sendOptions.transcriptId }),
        };

        // Send message in async mode
        logRef.current.log('[useDevicChat] Sending message async...');
        const response = await clientRef.current.sendMessageAsync(assistantId, dto);
        logRef.current.log('[useDevicChat] sendMessageAsync response:', response);

        // Update chat UID if this is a new chat
        if (response.chatUid && response.chatUid !== chatUid) {
          logRef.current.log('[useDevicChat] Setting chatUid:', response.chatUid);
          setChatUid(response.chatUid);
          onChatCreatedRef.current?.(response.chatUid);
        }

        // Start polling for results
        logRef.current.log('[useDevicChat] Setting shouldPoll to true');
        setShouldPoll(true);

        if (response.queued) {
          // Accepted, but not on its way to the model yet. Draw it as such, and
          // remember it: the poll has to keep running until it comes back inside
          // the conversation, however long the run in flight takes.
          rememberAwaiting();
          const queuedAt = Date.now();
          setMessages((prev) =>
            prev.map((m) =>
              m.uid === userMessage.uid ? { ...m, queued: true, queuedAt } : m
            )
          );
          setQueuedCount(response.queuePosition || 1);
          return {
            queued: true,
            queuePosition: response.queuePosition || 1,
            willProcess: response.willProcess || 'next_turn',
          };
        }

        return { queued: false };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        // Nothing was accepted either way, so the bubble goes.
        setMessages((prev) => prev.filter((m) => m.uid !== userMessage.uid));

        // The conversation turning a message down is not the conversation
        // breaking. Two shapes of the same 409: an assistant that does not queue
        // says so by name, and a full queue comes back as a plain conflict.
        const refusal =
          err instanceof DevicApiError
            ? err.errorType === 'CHAT_BUSY'
              ? 'chat_busy'
              : err.statusCode === 409
                ? 'queue_full'
                : null
            : null;

        if (refusal) {
          logRef.current.log('[useDevicChat] send refused:', refusal, error.message);
          // Deliberately leaves `isLoading`, `status` and `error` alone: the run
          // this message was written into is still going, and reporting the
          // refusal by stopping its indicator — or by painting the conversation
          // as failed — would be a lie about the run, not about the send.
          if (!wasBusy) {
            setIsLoading(false);
            setStatus('idle');
          }
          return {
            rejected: true,
            reason: refusal,
            message: error.message,
            restoredText: message,
          };
        }

        // A synchronous usage-limit block surfaces as HTTP 429 /
        // TENANT_LIMIT_EXCEEDED (sync send path). Async sends surface it via the
        // realtime `limit_exceeded` status instead — both are handled.
        if (
          err instanceof DevicApiError &&
          (err.statusCode === 429 || err.errorType === 'TENANT_LIMIT_EXCEEDED')
        ) {
          const details: TenantLimitExceeded =
            (err.details as TenantLimitExceeded) || { message: err.message };
          if (!details.message) details.message = err.message;
          setLimitExceeded(details);
        }

        setError(error);
        // Same reasoning as the refusal above: a send that failed while a run
        // was already going says nothing about that run, which the poll is still
        // watching. The error is reported either way.
        if (!wasBusy) {
          setIsLoading(false);
          setStatus('error');
        }
        onErrorRef.current?.(error);

        return {
          rejected: true,
          reason: 'error',
          message: error.message,
          restoredText: message,
        };
      }
    },
    [
      chatUid,
      assistantId,
      enabledTools,
      // Without this, the callback keeps the list from the render that created
      // it: switching an app off would not take effect until something else
      // happened to rebuild it.
      disabledIntegrations,
      resolvedTenantId,
      resolvedTenantMetadata,
      resolvedSubtenantId,
      resolvedSubtenantMetadata,
      resolvedTags,
      toolSchemas,
      onMessageSent,
      onFileUpload,
      rememberAwaiting,
    ]
  );

  // Clear chat
  const clearChat = useCallback(() => {
    setShouldPoll(false);
    setHandedOff(false);
    setHandedOffSubThreadId(null);
    if (handoffPollRef.current) {
      clearInterval(handoffPollRef.current);
      handoffPollRef.current = null;
    }
    setMessages([]);
    setChatUid(null);
    setIsLoading(false);
    setStatus('idle');
    setError(null);
    setLimitExceeded(null);
    setRecalledMemories([]);
    resetQueueState();
    pendingWidgetCallsRef.current = [];
    setPendingWidgetCalls([]);
  }, [resetQueueState]);

  // Load existing chat
  const loadChat = useCallback(
    async (loadChatUid: string) => {
      if (!clientRef.current) {
        const err = new Error('API client not configured');
        setError(err);
        onErrorRef.current?.(err);
        return;
      }

      // Reset any active polling/handoff state from previous conversation
      setShouldPoll(false);
      setHandedOff(false);
      setHandedOffSubThreadId(null);
      pendingWidgetCallsRef.current = [];
    setPendingWidgetCalls([]);
      if (handoffPollRef.current) {
        clearInterval(handoffPollRef.current);
        handoffPollRef.current = null;
      }

      setIsLoading(true);
      setError(null);
      setRecalledMemories([]);
      // The queue belongs to the conversation being left behind.
      resetQueueState();

      try {
        const history = await clientRef.current.getChatHistory(
          assistantId,
          loadChatUid,
          { tenantId: resolvedTenantId }
        );

        setMessages(history.chatContent);
        mergeRecalledMemories(history.recalledMemories);
        setChatUid(loadChatUid);

        // Check realtime status to resume in-progress conversations
        await resumeFromRealtimeStatus(loadChatUid);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onErrorRef.current?.(error);
        setIsLoading(false);
      }
    },
    [
      assistantId,
      resolvedTenantId,
      resumeFromRealtimeStatus,
      mergeRecalledMemories,
      resetQueueState,
    ]
  );

  // Handoff polling: while handedOff is true, poll the realtime endpoint every
  // 5s (or the configured cadence) to detect when the parent thread is no
  // longer in handed_off state.
  useEffect(() => {
    if (!handedOff || !chatUid || !clientRef.current) return;

    const pollHandoff = async () => {
      try {
        const realtime = await clientRef.current!.getRealtimeHistory(assistantId, chatUid!);
        logRef.current.log('[useDevicChat] Handoff poll - realtime status:', realtime.status);
        if (realtime.status !== 'handed_off') {
          // Handoff completed — clear handoff state and resume main polling
          if (handoffPollRef.current) {
            clearInterval(handoffPollRef.current);
            handoffPollRef.current = null;
          }
          setHandedOff(false);
          setHandedOffSubThreadId(null);
          // Resume main polling to pick up the parent thread's continuation
          setShouldPoll(true);
        }
      } catch {}
    };

    handoffPollRef.current = setInterval(pollHandoff, handoffPollingInterval);
    return () => {
      if (handoffPollRef.current) {
        clearInterval(handoffPollRef.current);
        handoffPollRef.current = null;
      }
    };
  }, [handedOff, chatUid, assistantId, handoffPollingInterval]);

  // Called by HandoffSubagentWidget when the subthread reaches a terminal state
  const onHandoffCompleted = useCallback(() => {
    logRef.current.log('[useDevicChat] onHandoffCompleted called');
    // Clear the handoff polling
    if (handoffPollRef.current) {
      clearInterval(handoffPollRef.current);
      handoffPollRef.current = null;
    }
    // Clear handoff state and resume main polling
    setHandedOff(false);
    setHandedOffSubThreadId(null);
    setShouldPoll(true);
  }, []);

  // Submit a response for a pending widget tool call
  const submitWidgetResponse = useCallback(
    async (toolCallId: string, response: any) => {
      const uid = chatUidRef.current;
      if (!clientRef.current || !uid) return;

      // Check pending widgets via ref (state updates are async)
      const current = pendingWidgetCallsRef.current;
      const found = current.some((c) => c.toolCall.id === toolCallId);
      if (!found) return;

      // Remove the widget call from pending list
      const remaining = current.filter((c) => c.toolCall.id !== toolCallId);
      pendingWidgetCallsRef.current = remaining;
      setPendingWidgetCalls(remaining);

      try {
        logRef.current.log('[useDevicChat] sending widget tool response', toolCallId);
        await clientRef.current.sendToolResponses(
          assistantId,
          uid,
          [{ tool_call_id: toolCallId, content: response, role: 'tool' }],
          toolSchemas
        );
        // Resume polling only if no more widget calls are blocking
        if (remaining.length === 0) {
          setShouldPoll(true);
          setIsLoading(true);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logRef.current.error('[useDevicChat] submitWidgetResponse failed', error);
        setError(error);
        onErrorRef.current?.(error);
      }
    },
    [assistantId, toolSchemas]
  );

  // Cancel a pending widget tool call (sends an error response to the model)
  const cancelWidgetCall = useCallback(
    async (toolCallId: string, reason?: string) => {
      await submitWidgetResponse(toolCallId, {
        error: reason || 'User cancelled the tool call',
      });
    },
    [submitWidgetResponse]
  );

  // Stop current conversation — calls the server-side stop endpoint
  // then stops polling and resets loading state.
  const stopChat = useCallback(async (): Promise<StopResult> => {
    const uid = chatUidRef.current;
    logRef.current.log('[useDevicChat] stopChat called, chatUid:', uid);
    let discarded: ChatMessage[] = [];
    if (clientRef.current && uid) {
      try {
        const result = await clientRef.current.stopChat(assistantId, uid);
        discarded = result?.discardedMessages ?? [];
        logRef.current.log('[useDevicChat] stopChat API call succeeded');
      } catch (err) {
        logRef.current.warn('[useDevicChat] stopChat API call failed:', err);
      }
    }

    // Stopping throws away whatever was queued behind the run — answering it
    // would be the opposite of what was just asked for. The bubbles go with it,
    // and the text is handed back so it can return to the box instead of
    // disappearing. An API that does not report what it discarded leaves the
    // bubbles alone, and the next poll has the last word.
    if (discarded.length) {
      setMessages((prev) => prev.filter((m) => !m.queued));
    }
    resetQueueState();

    setShouldPoll(false);
    setIsLoading(false);
    setStatus('idle');

    const restoredText = discarded
      .map((m) => m.content?.message)
      .filter(Boolean)
      .join('\n');

    return {
      discarded: discarded.length,
      ...(restoredText ? { restoredText } : {}),
    };
  }, [assistantId, resetQueueState]);

  return {
    messages,
    chatUid,
    isLoading,
    status,
    error,
    limitExceeded,
    recalledMemories,
    handedOff,
    handedOffSubThreadId,
    queuedCount,
    queueEnabled,
    sendMessage,
    clearChat,
    loadChat,
    onHandoffCompleted,
    stopChat,
    pendingWidgetCalls,
    submitWidgetResponse,
    cancelWidgetCall,
  };
}

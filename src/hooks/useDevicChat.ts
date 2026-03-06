import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useOptionalDevicContext } from '../provider';
import { DevicApiClient } from '../api/client';
import { usePolling } from './usePolling';
import { useModelInterface } from './useModelInterface';
import { createLogger } from '../utils/logger';
import type {
  ChatMessage,
  ChatFile,
  ModelInterfaceTool,
  RealtimeChatHistory,
  RealtimeStatus,
} from '../api/types';

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
   * Tenant metadata
   */
  tenantMetadata?: Record<string, any>;

  /**
   * Tools enabled from the assistant's configured tool groups
   */
  enabledTools?: string[];

  /**
   * Client-side tools for model interface protocol
   */
  modelInterfaceTools?: ModelInterfaceTool[];

  /**
   * Polling interval for async mode (ms)
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
   * Enable debug logging to the browser console.
   * Overrides the provider-level debug setting when provided.
   * @default false
   */
  debug?: boolean;
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
      files?: ChatFile[];
      metadata?: Record<string, any>;
    }
  ) => Promise<void>;

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
   * Stop the current conversation processing (client-side only).
   * Stops polling and resets loading state.
   */
  stopChat: () => void;
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
    enabledTools,
    modelInterfaceTools = [],
    pollingInterval = 1000,
    onMessageSent,
    onMessageReceived,
    onToolCall,
    onError,
    onChatCreated,
    debug: propsDebug,
  } = options;

  // Get context (may be null if not wrapped in provider)
  const context = useOptionalDevicContext();

  // Resolve configuration
  const apiKey = propsApiKey || context?.apiKey;
  const baseUrl = propsBaseUrl || context?.baseUrl || 'https://api.devic.ai';
  const resolvedTenantId = tenantId || context?.tenantId;
  const resolvedTenantMetadata = { ...context?.tenantMetadata, ...tenantMetadata };
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

  // Handoff state
  const [handedOff, setHandedOff] = useState(false);
  const [handedOffSubThreadId, setHandedOffSubThreadId] = useState<string | null>(null);
  const handoffPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Polling state
  const [shouldPoll, setShouldPoll] = useState(false);

  // Keep a ref to chatUid so async callbacks always read the latest value
  const chatUidRef = useRef(chatUid);
  chatUidRef.current = chatUid;

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
  if (!clientRef.current && apiKey) {
    clientRef.current = new DevicApiClient({ apiKey, baseUrl });
  }

  // Update client config if it changes
  useEffect(() => {
    if (clientRef.current && apiKey) {
      clientRef.current.setConfig({ apiKey, baseUrl });
    }
  }, [apiKey, baseUrl]);

  // Resume chat state based on realtime status.
  // Called after loading chat history to detect in-progress conversations.
  const resumeFromRealtimeStatus = useCallback(
    async (targetChatUid: string) => {
      if (!clientRef.current) return;
      try {
        const realtime = await clientRef.current.getRealtimeHistory(assistantId, targetChatUid);
        logRef.current.log('[useDevicChat] resumeFromRealtimeStatus:', realtime.status);

        // Update messages with realtime data (may be fresher than static history)
        if (realtime.chatHistory?.length) {
          setMessages(realtime.chatHistory);
        }
        setStatus(realtime.status);

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
    [assistantId]
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
      stopStatuses: ['completed', 'error', 'waiting_for_tool_response', 'handed_off'],
      onUpdate: async (data: RealtimeChatHistory) => {
        logRef.current.log('[useDevicChat] onUpdate called, status:', data.status);

        // Merge realtime data with optimistic messages
        setMessages((prev) => {
          const realtimeUIDs = new Set(data.chatHistory.map((m) => m.uid));
          const realtimeUserMessages = new Set(
            data.chatHistory
              .filter((m) => m.role === 'user')
              .map((m) => m.content?.message)
          );

          // Keep optimistic messages not yet in realtime data
          const optimistic = prev.filter((m) => {
            if (realtimeUIDs.has(m.uid)) return false;
            if (m.role === 'user' && realtimeUserMessages.has(m.content?.message)) return false;
            return true;
          });

          return [...data.chatHistory, ...optimistic];
        });
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
      onStop: (data) => {
        logRef.current.log('[useDevicChat] onStop called, status:', data?.status);
        setShouldPoll(false);

        if (data?.status === 'error') {
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
        // Execute client-side tools
        const responses = await handleToolCalls(pendingCalls);

        if (responses.length > 0) {
          // Send tool responses back to the API
          await clientRef.current.sendToolResponses(assistantId, chatUid, responses);

          // Resume polling
          setShouldPoll(true);
          setIsLoading(true);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onErrorRef.current?.(error);
      }
    },
    [chatUid, assistantId, handleToolCalls, extractPendingToolCalls]
  );

  // Send a message
  const sendMessage = useCallback(
    async (
      message: string,
      sendOptions?: {
        files?: ChatFile[];
        metadata?: Record<string, any>;
      }
    ) => {
      if (!clientRef.current) {
        const err = new Error(
          'API client not configured. Please provide an API key.'
        );
        setError(err);
        onErrorRef.current?.(err);
        return;
      }

      setIsLoading(true);
      setError(null);
      setStatus('processing');

      // Add user message optimistically
      const userMessage: ChatMessage = {
        uid: `temp-${Date.now()}`,
        role: 'user',
        content: {
          message,
          files: sendOptions?.files?.map((f) => ({
            name: f.name,
            url: f.downloadUrl || '',
            type: f.fileType || 'other',
          })),
        },
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      onMessageSent?.(userMessage);

      try {
        // Build request DTO
        const dto = {
          message,
          chatUid: chatUid || undefined,
          files: sendOptions?.files,
          metadata: {
            ...resolvedTenantMetadata,
            ...sendOptions?.metadata,
          },
          tenantId: resolvedTenantId,
          enabledTools,
          // Include model interface tools if any
          ...(toolSchemas.length > 0 && { tools: toolSchemas }),
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
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setIsLoading(false);
        setStatus('error');
        onErrorRef.current?.(error);

        // Remove optimistic user message on error
        setMessages((prev) => prev.filter((m) => m.uid !== userMessage.uid));
      }
    },
    [
      chatUid,
      assistantId,
      enabledTools,
      resolvedTenantId,
      resolvedTenantMetadata,
      toolSchemas,
      onMessageSent,
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
  }, []);

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
      if (handoffPollRef.current) {
        clearInterval(handoffPollRef.current);
        handoffPollRef.current = null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const history = await clientRef.current.getChatHistory(
          assistantId,
          loadChatUid,
          { tenantId: resolvedTenantId }
        );

        setMessages(history.chatContent);
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
    [assistantId, resolvedTenantId, resumeFromRealtimeStatus]
  );

  // Handoff polling: while handedOff is true, poll the realtime endpoint every 5s
  // to detect when the parent thread is no longer in handed_off state.
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

    handoffPollRef.current = setInterval(pollHandoff, 5000);
    return () => {
      if (handoffPollRef.current) {
        clearInterval(handoffPollRef.current);
        handoffPollRef.current = null;
      }
    };
  }, [handedOff, chatUid, assistantId]);

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

  // Stop current conversation — calls the server-side stop endpoint
  // then stops polling and resets loading state.
  const stopChat = useCallback(async () => {
    const uid = chatUidRef.current;
    logRef.current.log('[useDevicChat] stopChat called, chatUid:', uid);
    if (clientRef.current && uid) {
      try {
        await clientRef.current.stopChat(assistantId, uid);
        logRef.current.log('[useDevicChat] stopChat API call succeeded');
      } catch (err) {
        logRef.current.warn('[useDevicChat] stopChat API call failed:', err);
      }
    }
    setShouldPoll(false);
    setIsLoading(false);
    setStatus('idle');
  }, [assistantId]);

  return {
    messages,
    chatUid,
    isLoading,
    status,
    error,
    handedOff,
    handedOffSubThreadId,
    sendMessage,
    clearChat,
    loadChat,
    onHandoffCompleted,
    stopChat,
  };
}

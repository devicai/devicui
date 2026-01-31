import { useState, useEffect, useCallback, useRef } from 'react';
import { useOptionalDevicContext } from '../../provider';
import { DevicApiClient } from '../../api/client';
import { usePolling } from '../../hooks/usePolling';
import { useModelInterface } from '../../hooks/useModelInterface';
import type {
  ChatMessage,
  ModelInterfaceTool,
  RealtimeChatHistory,
} from '../../api/types';
import type {
  AIGenerationButtonOptions,
  GenerationResult,
} from './AIGenerationButton.types';
import type { ToolCallSummary } from '../AICommandBar/AICommandBar.types';

export interface UseAIGenerationButtonOptions {
  assistantId: string;
  apiKey?: string;
  baseUrl?: string;
  tenantId?: string;
  tenantMetadata?: Record<string, any>;
  options?: AIGenerationButtonOptions;
  modelInterfaceTools?: ModelInterfaceTool[];
  onResponse?: (result: GenerationResult) => void;
  onBeforeSend?: (prompt: string) => string | undefined | Promise<string | undefined>;
  onError?: (error: Error) => void;
  onStart?: () => void;
  onOpen?: () => void;
  onClose?: () => void;
  disabled?: boolean;
}

export interface UseAIGenerationButtonResult {
  // State
  isOpen: boolean;
  isProcessing: boolean;
  inputValue: string;
  setInputValue: (value: string) => void;
  error: Error | null;
  result: GenerationResult | null;

  // Tool calls state
  toolCalls: ToolCallSummary[];
  currentToolSummary: string | null;

  // Input ref
  inputRef: React.RefObject<HTMLTextAreaElement>;

  // Actions
  open: () => void;
  close: () => void;
  toggle: () => void;
  generate: (prompt?: string) => Promise<GenerationResult | null>;
  reset: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * Hook for managing AIGenerationButton state and behavior
 */
export function useAIGenerationButton(
  options: UseAIGenerationButtonOptions
): UseAIGenerationButtonResult {
  const {
    assistantId,
    apiKey: propsApiKey,
    baseUrl: propsBaseUrl,
    tenantId,
    tenantMetadata,
    options: buttonOptions = {},
    modelInterfaceTools = [],
    onResponse,
    onBeforeSend,
    onError,
    onStart,
    onOpen,
    onClose,
    disabled,
  } = options;

  const { mode = 'modal' } = buttonOptions;

  // Get context
  const context = useOptionalDevicContext();
  const apiKey = propsApiKey || context?.apiKey;
  const baseUrl = propsBaseUrl || context?.baseUrl || 'https://api.devic.ai';
  const resolvedTenantId = tenantId || context?.tenantId;
  const resolvedTenantMetadata = { ...context?.tenantMetadata, ...tenantMetadata };

  // State
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [chatUid, setChatUid] = useState<string | null>(null);
  const [shouldPoll, setShouldPoll] = useState(false);

  // Tool calls state
  const [toolCalls, setToolCalls] = useState<ToolCallSummary[]>([]);
  const [currentToolSummary, setCurrentToolSummary] = useState<string | null>(null);

  // Refs
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resolveRef = useRef<((value: GenerationResult | null) => void) | null>(null);

  // Callback refs
  const onErrorRef = useRef(onError);
  const onResponseRef = useRef(onResponse);
  const onBeforeSendRef = useRef(onBeforeSend);
  const onStartRef = useRef(onStart);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onErrorRef.current = onError;
    onResponseRef.current = onResponse;
    onBeforeSendRef.current = onBeforeSend;
    onStartRef.current = onStart;
    onOpenRef.current = onOpen;
    onCloseRef.current = onClose;
  });

  // API client
  const clientRef = useRef<DevicApiClient | null>(null);
  if (!clientRef.current && apiKey) {
    clientRef.current = new DevicApiClient({ apiKey, baseUrl });
  }

  useEffect(() => {
    if (clientRef.current && apiKey) {
      clientRef.current.setConfig({ apiKey, baseUrl });
    }
  }, [apiKey, baseUrl]);

  // Model interface
  const {
    toolSchemas,
    handleToolCalls: executeToolCalls,
    extractPendingToolCalls,
  } = useModelInterface({
    tools: modelInterfaceTools,
  });

  /**
   * Format tool name to human-readable (fallback when no summary)
   */
  const formatToolName = (toolName: string): string => {
    return toolName
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase()
      .replace(/^./, (c) => c.toUpperCase());
  };

  /**
   * Process tool calls from realtime data
   */
  const processToolCalls = useCallback((messages: ChatMessage[]): ToolCallSummary[] => {
    const summaries: ToolCallSummary[] = [];
    const toolResponseMap = new Map<string, any>();

    // Collect tool responses
    for (const msg of messages) {
      if (msg.role === 'tool' && msg.tool_call_id) {
        toolResponseMap.set(msg.tool_call_id, msg.content);
      }
    }

    // Collect tool calls from assistant messages
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          const hasResponse = toolResponseMap.has(tc.id);
          let input: any;
          try {
            input = JSON.parse(tc.function.arguments || '{}');
          } catch {
            input = {};
          }

          // Use message summary if available, otherwise format tool name
          const summaryText = msg.summary || formatToolName(tc.function.name);

          summaries.push({
            id: tc.id,
            name: tc.function.name,
            status: hasResponse ? 'completed' : 'executing',
            summary: summaryText,
            input,
            output: toolResponseMap.get(tc.id),
          });
        }
      }
    }

    return summaries;
  }, []);

  // Handle pending client-side tool calls
  const handlePendingToolCalls = useCallback(
    async (data: RealtimeChatHistory) => {
      if (!clientRef.current || !chatUid) return;

      const pendingCalls = data.pendingToolCalls || extractPendingToolCalls(data.chatHistory);
      if (pendingCalls.length === 0) return;

      try {
        const responses = await executeToolCalls(pendingCalls);
        if (responses.length > 0) {
          await clientRef.current.sendToolResponses(assistantId, chatUid, responses);
          setShouldPoll(true);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onErrorRef.current?.(error);
      }
    },
    [chatUid, assistantId, executeToolCalls, extractPendingToolCalls]
  );

  // Polling
  usePolling(
    shouldPoll ? chatUid : null,
    async () => {
      if (!clientRef.current || !chatUid) {
        throw new Error('Cannot poll without client or chatUid');
      }
      return clientRef.current.getRealtimeHistory(assistantId, chatUid);
    },
    {
      interval: 1000,
      enabled: shouldPoll,
      stopStatuses: ['completed', 'error', 'waiting_for_tool_response'],
      onUpdate: async (data: RealtimeChatHistory) => {
        // Update tool calls display
        const summaries = processToolCalls(data.chatHistory);
        setToolCalls(summaries);

        // Update current tool summary - show executing tool or last tool
        if (summaries.length > 0) {
          const lastExecuting = summaries.filter(s => s.status === 'executing').pop();
          const lastTool = summaries[summaries.length - 1];
          setCurrentToolSummary(lastExecuting?.summary || lastTool?.summary || null);
        }

        // Handle client-side tool calls
        if (data.status === 'waiting_for_tool_response' || data.pendingToolCalls?.length) {
          await handlePendingToolCalls(data);
        }
      },
      onStop: (data) => {
        setShouldPoll(false);

        if (data?.status === 'error') {
          setIsProcessing(false);
          const err = new Error('Processing failed');
          setError(err);
          onErrorRef.current?.(err);
          resolveRef.current?.(null);
          resolveRef.current = null;
          return;
        }

        if (data?.status === 'completed') {
          setIsProcessing(false);

          // Extract final assistant message
          const assistantMessages = data.chatHistory.filter((m: ChatMessage) => m.role === 'assistant');
          const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];

          if (lastAssistantMessage && chatUid) {
            const finalToolCalls = processToolCalls(data.chatHistory);
            const generationResult: GenerationResult = {
              chatUid,
              message: lastAssistantMessage,
              toolCalls: finalToolCalls,
              rawResponse: data,
            };

            setResult(generationResult);
            onResponseRef.current?.(generationResult);
            resolveRef.current?.(generationResult);
            resolveRef.current = null;

            // Close modal/tooltip after successful generation
            setIsOpen(false);
            onCloseRef.current?.();
          }
        }
      },
      onError: (err) => {
        setError(err);
        setIsProcessing(false);
        setShouldPoll(false);
        onErrorRef.current?.(err);
        resolveRef.current?.(null);
        resolveRef.current = null;
      },
    }
  );

  // Open modal/tooltip
  const open = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setError(null);
    onOpenRef.current?.();
    // Focus input after opening
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [disabled]);

  // Close modal/tooltip
  const close = useCallback(() => {
    setIsOpen(false);
    setInputValue('');
    onCloseRef.current?.();
  }, []);

  // Toggle
  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, open, close]);

  // Generate
  const generate = useCallback(
    async (prompt?: string): Promise<GenerationResult | null> => {
      // Determine the prompt to use
      let finalPrompt = prompt ?? inputValue;

      // For direct mode, use predefined prompt if no prompt provided
      if (mode === 'direct' && !finalPrompt) {
        finalPrompt = buttonOptions.prompt || '';
      }

      if (!finalPrompt.trim()) {
        const err = new Error('Prompt is required');
        setError(err);
        onErrorRef.current?.(err);
        return null;
      }

      if (disabled) {
        return null;
      }

      if (!clientRef.current) {
        const err = new Error('API client not configured. Please provide an API key.');
        setError(err);
        onErrorRef.current?.(err);
        return null;
      }

      // Call onBeforeSend hook
      if (onBeforeSendRef.current) {
        const modifiedPrompt = await onBeforeSendRef.current(finalPrompt);
        if (modifiedPrompt !== undefined) {
          finalPrompt = modifiedPrompt;
        }
      }

      // Start processing
      setIsProcessing(true);
      setError(null);
      setResult(null);
      setToolCalls([]);
      setCurrentToolSummary(null);
      onStartRef.current?.();

      // Create a promise that will resolve when generation completes
      const resultPromise = new Promise<GenerationResult | null>((resolve) => {
        resolveRef.current = resolve;
      });

      try {
        const dto = {
          message: finalPrompt,
          metadata: resolvedTenantMetadata,
          tenantId: resolvedTenantId,
          ...(toolSchemas.length > 0 && { tools: toolSchemas }),
        };

        const response = await clientRef.current.sendMessageAsync(assistantId, dto);

        if (response.chatUid) {
          setChatUid(response.chatUid);
        }

        setShouldPoll(true);

        return resultPromise;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setIsProcessing(false);
        onErrorRef.current?.(error);
        return null;
      }
    },
    [
      inputValue,
      mode,
      buttonOptions.prompt,
      disabled,
      assistantId,
      resolvedTenantId,
      resolvedTenantMetadata,
      toolSchemas,
    ]
  );

  // Reset
  const reset = useCallback(() => {
    setIsOpen(false);
    setIsProcessing(false);
    setInputValue('');
    setError(null);
    setResult(null);
    setChatUid(null);
    setShouldPoll(false);
    setToolCalls([]);
    setCurrentToolSummary(null);
  }, []);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Handle Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }

      // Handle Enter to submit (Cmd/Ctrl + Enter or Enter without Shift)
      if (e.key === 'Enter' && !isProcessing) {
        if (e.metaKey || e.ctrlKey || !e.shiftKey) {
          e.preventDefault();
          generate();
        }
      }
    },
    [isProcessing, generate, close]
  );

  return {
    isOpen,
    isProcessing,
    inputValue,
    setInputValue,
    error,
    result,
    toolCalls,
    currentToolSummary,
    inputRef,
    open,
    close,
    toggle,
    generate,
    reset,
    handleKeyDown,
  };
}

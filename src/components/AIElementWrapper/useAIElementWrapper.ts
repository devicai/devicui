import { useState, useCallback, useRef, useEffect } from 'react';
import { useOptionalDevicContext } from '../../provider';
import { DevicApiClient } from '../../api/client';
import { usePolling } from '../../hooks/usePolling';
import { useModelInterface } from '../../hooks/useModelInterface';
import type {
  ChatMessage,
  ModelInterfaceTool,
  RealtimeChatHistory,
} from '../../api/types';

export interface UseAIElementWrapperOptions {
  assistantId?: string;
  apiKey?: string;
  baseUrl?: string;
  tenantId?: string;
  tenantMetadata?: Record<string, any>;
  modelInterfaceTools?: ModelInterfaceTool[];
  onResponse?: (message: ChatMessage) => void;
  onError?: (error: Error) => void;
}

export interface UseAIElementWrapperResult {
  isProcessing: boolean;
  response: ChatMessage | null;
  error: Error | null;
  /** Send a prompt to the inline assistant. */
  sendInlinePrompt: (prompt: string) => Promise<void>;
  /** Reset response/error state. */
  reset: () => void;
}

/**
 * Hook that manages the inline AI generation flow for AIElementWrapper.
 * Reuses sendMessageAsync + polling, similar to useAIGenerationButton but
 * without the modal/tooltip UI orchestration.
 */
export function useAIElementWrapper(
  options: UseAIElementWrapperOptions
): UseAIElementWrapperResult {
  const {
    assistantId,
    apiKey: propsApiKey,
    baseUrl: propsBaseUrl,
    tenantId,
    tenantMetadata,
    modelInterfaceTools = [],
    onResponse,
    onError,
  } = options;

  const context = useOptionalDevicContext();
  const apiKey = propsApiKey || context?.apiKey;
  const baseUrl = propsBaseUrl || context?.baseUrl || 'https://api.devic.ai';
  const resolvedTenantId = tenantId || context?.tenantId;
  const resolvedTenantMetadata = { ...context?.tenantMetadata, ...tenantMetadata };

  const [isProcessing, setIsProcessing] = useState(false);
  const [response, setResponse] = useState<ChatMessage | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [chatUid, setChatUid] = useState<string | null>(null);
  const [shouldPoll, setShouldPoll] = useState(false);

  const onResponseRef = useRef(onResponse);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onResponseRef.current = onResponse;
    onErrorRef.current = onError;
  });

  const clientRef = useRef<DevicApiClient | null>(null);
  if (!clientRef.current && apiKey) {
    clientRef.current = new DevicApiClient({ apiKey, baseUrl });
  }
  useEffect(() => {
    if (clientRef.current && apiKey) {
      clientRef.current.setConfig({ apiKey, baseUrl });
    }
  }, [apiKey, baseUrl]);

  const {
    toolSchemas,
    handleToolCalls: executeToolCalls,
    extractPendingToolCalls,
  } = useModelInterface({ tools: modelInterfaceTools });

  const handlePendingToolCalls = useCallback(
    async (data: RealtimeChatHistory) => {
      if (!clientRef.current || !chatUid || !assistantId) return;
      const pendingCalls =
        data.pendingToolCalls || extractPendingToolCalls(data.chatHistory);
      if (pendingCalls.length === 0) return;
      try {
        const { responses } = await executeToolCalls(pendingCalls);
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

  usePolling(
    shouldPoll ? chatUid : null,
    async () => {
      if (!clientRef.current || !chatUid || !assistantId) {
        throw new Error('Cannot poll without client, chatUid or assistantId');
      }
      return clientRef.current.getRealtimeHistory(assistantId, chatUid);
    },
    {
      interval: 1000,
      enabled: shouldPoll,
      stopStatuses: ['completed', 'error', 'waiting_for_tool_response'],
      onUpdate: async (data: RealtimeChatHistory) => {
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
          return;
        }
        if (data?.status === 'completed') {
          setIsProcessing(false);
          const assistantMessages = data.chatHistory.filter(
            (m: ChatMessage) => m.role === 'assistant'
          );
          const last = assistantMessages[assistantMessages.length - 1];
          if (last) {
            setResponse(last);
            onResponseRef.current?.(last);
          }
        }
      },
      onError: (err) => {
        setError(err);
        setIsProcessing(false);
        setShouldPoll(false);
        onErrorRef.current?.(err);
      },
    }
  );

  const sendInlinePrompt = useCallback(
    async (prompt: string) => {
      if (!assistantId) {
        const err = new Error('assistantId is required for inline behavior');
        setError(err);
        onErrorRef.current?.(err);
        return;
      }
      if (!clientRef.current) {
        const err = new Error('API client not configured. Please provide an API key.');
        setError(err);
        onErrorRef.current?.(err);
        return;
      }
      const trimmed = prompt.trim();
      if (!trimmed) {
        const err = new Error('Prompt is empty');
        setError(err);
        onErrorRef.current?.(err);
        return;
      }

      setIsProcessing(true);
      setError(null);
      setResponse(null);

      try {
        const dto = {
          message: trimmed,
          metadata: resolvedTenantMetadata,
          tenantId: resolvedTenantId,
          ...(toolSchemas.length > 0 && { tools: toolSchemas }),
        };
        const resp = await clientRef.current.sendMessageAsync(assistantId, dto);
        if (resp.chatUid) setChatUid(resp.chatUid);
        setShouldPoll(true);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setIsProcessing(false);
        onErrorRef.current?.(error);
      }
    },
    [assistantId, resolvedTenantId, resolvedTenantMetadata, toolSchemas]
  );

  const reset = useCallback(() => {
    setIsProcessing(false);
    setResponse(null);
    setError(null);
    setChatUid(null);
    setShouldPoll(false);
  }, []);

  return {
    isProcessing,
    response,
    error,
    sendInlinePrompt,
    reset,
  };
}

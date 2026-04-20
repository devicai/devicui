import { useCallback, useMemo } from 'react';
import type {
  ModelInterfaceTool,
  ModelInterfaceToolSchema,
  ToolCall,
  ToolCallResponse,
  ChatMessage,
  ResponseWidgetConfig,
} from '../api/types';

export interface PendingWidgetCall {
  toolCall: ToolCall;
  params: any;
  widget: ResponseWidgetConfig;
  toolName: string;
}

export interface HandleToolCallsResult {
  /** Responses ready to send back to the API (from callback-based tools) */
  responses: ToolCallResponse[];
  /** Tool calls that require user interaction via a response widget */
  widgetCalls: PendingWidgetCall[];
}

export interface UseModelInterfaceOptions {
  /**
   * Client-side tools available for model interface protocol
   */
  tools: ModelInterfaceTool[];

  /**
   * Callback when a tool is being executed
   */
  onToolExecute?: (toolName: string, params: any) => void;

  /**
   * Callback when a tool execution completes
   */
  onToolComplete?: (toolName: string, result: any) => void;

  /**
   * Callback when a tool execution fails
   */
  onToolError?: (toolName: string, error: Error) => void;
}

export interface UseModelInterfaceResult {
  /**
   * Tool schemas to send to the API
   */
  toolSchemas: ModelInterfaceToolSchema[];

  /**
   * Check if a tool call should be handled client-side
   */
  isClientTool: (toolName: string) => boolean;

  /**
   * Check if a tool has a response widget (user-driven) instead of a callback
   */
  hasResponseWidget: (toolName: string) => boolean;

  /**
   * Get the tool definition by name
   */
  getTool: (toolName: string) => ModelInterfaceTool | undefined;

  /**
   * Handle tool calls from the model.
   * Callback-based tools are executed immediately and their responses returned.
   * Widget-based tools are returned as pending widget calls for user interaction.
   */
  handleToolCalls: (toolCalls: ToolCall[]) => Promise<HandleToolCallsResult>;

  /**
   * Process messages and extract pending tool calls that need client handling
   */
  extractPendingToolCalls: (messages: ChatMessage[]) => ToolCall[];
}

/**
 * Hook for implementing the Model Interface Protocol
 *
 * The Model Interface Protocol allows client-side tools to be executed
 * during an assistant conversation. When the model calls a client-side tool,
 * this hook handles executing the tool and preparing the response.
 *
 * @example
 * ```tsx
 * const { toolSchemas, handleToolCalls } = useModelInterface({
 *   tools: [
 *     {
 *       toolName: 'get_user_location',
 *       schema: {
 *         type: 'function',
 *         function: {
 *           name: 'get_user_location',
 *           description: 'Get user current location',
 *           parameters: { type: 'object', properties: {} }
 *         }
 *       },
 *       callback: async () => {
 *         const pos = await getCurrentPosition();
 *         return { lat: pos.coords.latitude, lng: pos.coords.longitude };
 *       }
 *     }
 *   ]
 * });
 * ```
 */
export function useModelInterface(
  options: UseModelInterfaceOptions
): UseModelInterfaceResult {
  const { tools, onToolExecute, onToolComplete, onToolError } = options;

  // Extract tool schemas for API
  const toolSchemas = useMemo(() => {
    return tools.map((tool) => tool.schema);
  }, [tools]);

  // Map of tool name to tool definition
  const toolMap = useMemo(() => {
    return new Map(tools.map((tool) => [tool.toolName, tool]));
  }, [tools]);

  // Check if a tool is a client-side tool
  const isClientTool = useCallback(
    (toolName: string): boolean => {
      return toolMap.has(toolName);
    },
    [toolMap]
  );

  const hasResponseWidget = useCallback(
    (toolName: string): boolean => Boolean(toolMap.get(toolName)?.responseWidget),
    [toolMap]
  );

  const getTool = useCallback(
    (toolName: string): ModelInterfaceTool | undefined => toolMap.get(toolName),
    [toolMap]
  );

  // Handle tool calls: execute callback tools, queue widget tools for user input
  const handleToolCalls = useCallback(
    async (toolCalls: ToolCall[]): Promise<HandleToolCallsResult> => {
      const responses: ToolCallResponse[] = [];
      const widgetCalls: PendingWidgetCall[] = [];

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        const tool = toolMap.get(toolName);

        if (!tool) continue;

        let params: any = {};
        try {
          params = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          // Keep empty params if parsing fails
        }

        onToolExecute?.(toolName, params);

        if (tool.responseWidget) {
          widgetCalls.push({
            toolCall,
            params,
            widget: tool.responseWidget,
            toolName,
          });
          continue;
        }

        if (!tool.callback) {
          // Neither callback nor widget — respond with error so the model can continue
          responses.push({
            tool_call_id: toolCall.id,
            content: { error: `Tool "${toolName}" has no callback or responseWidget` },
            role: 'tool',
          });
          continue;
        }

        try {
          const result = await tool.callback(params);
          onToolComplete?.(toolName, result);
          responses.push({
            tool_call_id: toolCall.id,
            content: result,
            role: 'tool',
          });
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          onToolError?.(toolName, error);
          responses.push({
            tool_call_id: toolCall.id,
            content: { error: error.message },
            role: 'tool',
          });
        }
      }

      return { responses, widgetCalls };
    },
    [toolMap, onToolExecute, onToolComplete, onToolError]
  );

  // Extract pending tool calls from messages that need client handling
  const extractPendingToolCalls = useCallback(
    (messages: ChatMessage[]): ToolCall[] => {
      const pendingCalls: ToolCall[] = [];

      // Look at the last assistant message
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];

        if (message.role === 'assistant' && message.tool_calls?.length) {
          // Filter for client-side tools only
          const clientToolCalls = message.tool_calls.filter((tc) =>
            isClientTool(tc.function.name)
          );

          // Check if these tool calls have been responded to
          const respondedToolIds = new Set(
            messages
              .slice(i + 1)
              .filter((m) => m.role === 'tool')
              .map((m) => m.tool_call_id)
          );

          // Get unresponded tool calls
          for (const tc of clientToolCalls) {
            if (!respondedToolIds.has(tc.id)) {
              pendingCalls.push(tc);
            }
          }

          // Only check the most recent assistant message with tool calls
          break;
        }
      }

      return pendingCalls;
    },
    [isClientTool]
  );

  return {
    toolSchemas,
    isClientTool,
    hasResponseWidget,
    getTool,
    handleToolCalls,
    extractPendingToolCalls,
  };
}

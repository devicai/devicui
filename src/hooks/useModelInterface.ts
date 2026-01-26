import { useCallback, useMemo } from 'react';
import type {
  ModelInterfaceTool,
  ModelInterfaceToolSchema,
  ToolCall,
  ToolCallResponse,
  ChatMessage,
} from '../api/types';

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
   * Handle tool calls from the model, returns tool responses
   */
  handleToolCalls: (toolCalls: ToolCall[]) => Promise<ToolCallResponse[]>;

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

  // Handle tool calls and execute client-side tools
  const handleToolCalls = useCallback(
    async (toolCalls: ToolCall[]): Promise<ToolCallResponse[]> => {
      const responses: ToolCallResponse[] = [];

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        const tool = toolMap.get(toolName);

        if (!tool) {
          // Not a client-side tool, skip
          continue;
        }

        try {
          // Parse arguments
          let params: any = {};
          try {
            params = JSON.parse(toolCall.function.arguments || '{}');
          } catch {
            // Keep empty params if parsing fails
          }

          // Notify about execution
          onToolExecute?.(toolName, params);

          // Execute the tool callback
          const result = await tool.callback(params);

          // Notify about completion
          onToolComplete?.(toolName, result);

          // Add response
          responses.push({
            tool_call_id: toolCall.id,
            content: result,
            role: 'tool',
          });
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));

          // Notify about error
          onToolError?.(toolName, error);

          // Add error response
          responses.push({
            tool_call_id: toolCall.id,
            content: { error: error.message },
            role: 'tool',
          });
        }
      }

      return responses;
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
    handleToolCalls,
    extractPendingToolCalls,
  };
}

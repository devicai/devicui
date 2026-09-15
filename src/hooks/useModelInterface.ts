import { useCallback, useMemo, useRef } from 'react';
import type {
  ModelInterfaceTool,
  ModelInterfaceToolSchema,
  ToolCall,
  ToolCallResponse,
  ChatMessage,
  RealtimeChatHistory,
  ResponseWidgetConfig,
} from '../api/types';

/**
 * How long a call to a tool this client does not have is given to show up
 * before it is answered as unavailable. Tools come and go with the screen the
 * user is on, and the screen the model has just navigated to may not have
 * registered its own yet.
 */
export const UNAVAILABLE_TOOL_GRACE_MS = 5_000;
const UNAVAILABLE_TOOL_CHECK_MS = 250;

/**
 * The answer to a call for a client-side tool this client does not have loaded
 * — typically one registered by a screen the user has since left.
 *
 * Answering is the point. The API holds the conversation in
 * `waiting_for_tool_response` until every call it handed to the client is
 * answered, and nothing else will answer this one: the run never resumes, and
 * every later message is refused or parked behind it.
 */
export function unavailableToolResponse(toolCall: ToolCall): ToolCallResponse {
  return {
    tool_call_id: toolCall.id,
    content: {
      error: `Tool "${toolCall.function.name}" is not available: the application no longer offers it in its current context (the user may have moved to another screen). Do not call it again unless it is offered again.`,
      errorType: 'TOOL_UNAVAILABLE',
    },
    role: 'tool',
  };
}

/**
 * The calls still unanswered in the most recent assistant message that made
 * any, narrowed to the ones `include` accepts.
 */
function unansweredToolCalls(
  messages: ChatMessage[],
  include: (toolCall: ToolCall) => boolean
): ToolCall[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'assistant' || !message.tool_calls?.length) continue;

    const answered = new Set(
      messages
        .slice(i + 1)
        .filter((m) => m.role === 'tool')
        .map((m) => m.tool_call_id)
    );
    return message.tool_calls.filter(
      (toolCall) => include(toolCall) && !answered.has(toolCall.id)
    );
  }
  return [];
}

/**
 * The tool calls a client owes an answer to, given a realtime snapshot.
 *
 * While a run is going, only the calls to the client's own tools are its
 * business: anything else in the same message is a backend tool the run is
 * still executing. Once the API reports `waiting_for_tool_response` the backend
 * has done its part — it runs its own tools before pausing — so every call
 * still unanswered is waiting on the client, including one to a tool that is
 * no longer loaded. Those are returned too, so they can be answered as
 * unavailable instead of blocking the conversation.
 *
 * The exception is a backend tool that answers asynchronously: the
 * conversation waits on it as well, but the answer comes from an external
 * system, and the API lists it in `pendingAsyncToolCalls`.
 */
export function resolvePendingToolCalls(
  data: Pick<
    RealtimeChatHistory,
    'status' | 'chatHistory' | 'pendingToolCalls' | 'pendingAsyncToolCalls'
  >,
  isClientTool: (toolName: string) => boolean
): ToolCall[] {
  if (data.pendingToolCalls) return data.pendingToolCalls;

  const messages = data.chatHistory ?? [];
  if (data.status !== 'waiting_for_tool_response') {
    return unansweredToolCalls(messages, (toolCall) =>
      isClientTool(toolCall.function.name)
    );
  }

  const answeredElsewhere = new Set(
    (data.pendingAsyncToolCalls ?? []).map((call) => call.toolCallId)
  );
  return unansweredToolCalls(
    messages,
    (toolCall) => !answeredElsewhere.has(toolCall.id)
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  /**
   * The tool schemas on offer once the calls were handled — what to restate
   * alongside the responses. It can differ from the ones at the start of the
   * call when the tools changed while an unavailable one was being waited for.
   */
  toolSchemas: ModelInterfaceToolSchema[];
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

  /**
   * How long (ms) a call to a tool that is not loaded waits for it to appear
   * before it is answered as unavailable.
   * @default 5000
   */
  unavailableToolGraceMs?: number;
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
   * A call to a tool that is not loaded waits `unavailableToolGraceMs` for it to
   * appear, and is otherwise answered as unavailable.
   */
  handleToolCalls: (toolCalls: ToolCall[]) => Promise<HandleToolCallsResult>;

  /**
   * Process messages and extract pending tool calls that need client handling
   */
  extractPendingToolCalls: (messages: ChatMessage[]) => ToolCall[];

  /**
   * The tool calls this client owes an answer to in a realtime snapshot: its
   * own pending calls, plus — while the API waits for a tool response — calls
   * to tools it does not have loaded, which must still be answered.
   */
  resolvePendingToolCalls: (data: RealtimeChatHistory) => ToolCall[];
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
  const {
    tools,
    onToolExecute,
    onToolComplete,
    onToolError,
    unavailableToolGraceMs = UNAVAILABLE_TOOL_GRACE_MS,
  } = options;

  // Extract tool schemas for API
  const toolSchemas = useMemo(() => {
    return tools.map((tool) => tool.schema);
  }, [tools]);

  // Map of tool name to tool definition
  const toolMap = useMemo(() => {
    return new Map(tools.map((tool) => [tool.toolName, tool]));
  }, [tools]);

  // The tools as of the latest render: a call waiting for a tool to appear
  // has to see the ones registered after it started.
  const toolMapRef = useRef(toolMap);
  toolMapRef.current = toolMap;
  const toolSchemasRef = useRef(toolSchemas);
  toolSchemasRef.current = toolSchemas;

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

      const handle = async (toolCall: ToolCall, tool: ModelInterfaceTool) => {
        const toolName = toolCall.function.name;

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
          return;
        }

        if (!tool.callback) {
          // Neither callback nor widget — respond with error so the model can continue
          responses.push({
            tool_call_id: toolCall.id,
            content: { error: `Tool "${toolName}" has no callback or responseWidget` },
            role: 'tool',
          });
          return;
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
      };

      const missing: ToolCall[] = [];
      for (const toolCall of toolCalls) {
        const tool = toolMapRef.current.get(toolCall.function.name);
        if (tool) await handle(toolCall, tool);
        else missing.push(toolCall);
      }

      if (missing.length > 0) {
        const allLoaded = () =>
          missing.every((toolCall) => toolMapRef.current.has(toolCall.function.name));
        const deadline = Date.now() + unavailableToolGraceMs;
        while (!allLoaded() && Date.now() < deadline) {
          await sleep(Math.min(UNAVAILABLE_TOOL_CHECK_MS, deadline - Date.now()));
        }

        for (const toolCall of missing) {
          const tool = toolMapRef.current.get(toolCall.function.name);
          if (tool) await handle(toolCall, tool);
          else responses.push(unavailableToolResponse(toolCall));
        }
      }

      return { responses, widgetCalls, toolSchemas: toolSchemasRef.current };
    },
    [onToolExecute, onToolComplete, onToolError, unavailableToolGraceMs]
  );

  // Extract pending tool calls from messages that need client handling
  const extractPendingToolCalls = useCallback(
    (messages: ChatMessage[]): ToolCall[] =>
      unansweredToolCalls(messages, (toolCall) => isClientTool(toolCall.function.name)),
    [isClientTool]
  );

  const resolvePending = useCallback(
    (data: RealtimeChatHistory): ToolCall[] => resolvePendingToolCalls(data, isClientTool),
    [isClientTool]
  );

  return {
    toolSchemas,
    isClientTool,
    hasResponseWidget,
    getTool,
    handleToolCalls,
    extractPendingToolCalls,
    resolvePendingToolCalls: resolvePending,
  };
}

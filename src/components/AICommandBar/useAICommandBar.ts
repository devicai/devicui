import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  AICommandBarOptions,
  AICommandBarCommand,
  CommandBarResult,
  ToolCallSummary,
  ChatDrawerHandle,
} from './AICommandBar.types';

export interface UseAICommandBarOptions {
  assistantId: string;
  apiKey?: string;
  baseUrl?: string;
  tenantId?: string;
  tenantMetadata?: Record<string, any>;
  options?: AICommandBarOptions;
  isVisible?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
  onExecute?: 'openDrawer' | 'callback';
  chatDrawerRef?: React.RefObject<ChatDrawerHandle>;
  onResponse?: (response: CommandBarResult) => void;
  modelInterfaceTools?: ModelInterfaceTool[];
  onSubmit?: (message: string) => void;
  onToolCall?: (toolName: string, params: Record<string, any>) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface UseAICommandBarResult {
  // Visibility
  isVisible: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;

  // Input
  inputValue: string;
  setInputValue: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  focus: () => void;

  // Processing state
  isProcessing: boolean;
  toolCalls: ToolCallSummary[];
  currentToolSummary: string | null;

  // Result
  result: CommandBarResult | null;
  chatUid: string | null;
  error: Error | null;

  // History
  history: string[];
  historyIndex: number;
  showingHistory: boolean;
  setShowingHistory: (show: boolean) => void;

  // Commands
  showingCommands: boolean;
  filteredCommands: AICommandBarCommand[];
  selectedCommandIndex: number;
  selectCommand: (command: AICommandBarCommand) => void;

  // Actions
  submit: (message?: string) => Promise<void>;
  reset: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  clearHistory: () => void;
}

/**
 * Parse a shortcut string like "cmd+j" into its components
 */
function parseShortcut(shortcut: string): { key: string; modifiers: string[] } {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts.pop() || '';
  const modifiers = parts;
  return { key, modifiers };
}

/**
 * Check if a keyboard event matches a shortcut string
 */
function matchShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const { key, modifiers } = parseShortcut(shortcut);

  const keyMatch = event.key.toLowerCase() === key;
  const cmdMatch = modifiers.includes('cmd') === (event.metaKey || event.ctrlKey);
  const shiftMatch = modifiers.includes('shift') === event.shiftKey;
  const altMatch = modifiers.includes('alt') === event.altKey;

  return keyMatch && cmdMatch && shiftMatch && altMatch;
}

/**
 * Format a shortcut string for display
 */
export function formatShortcut(shortcut: string): string {
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  return shortcut
    .replace(/cmd/gi, isMac ? '\u2318' : 'Ctrl')
    .replace(/shift/gi, '\u21E7')
    .replace(/alt/gi, isMac ? '\u2325' : 'Alt')
    .replace(/\+/g, ' ')
    .replace(/([a-z])/gi, (match) => match.toUpperCase());
}

/**
 * Format tool name to human-readable (fallback when no summary)
 */
function formatToolName(toolName: string): string {
  // Convert snake_case or camelCase to human-readable
  return toolName
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Hook for managing AICommandBar state and behavior
 */
export function useAICommandBar(options: UseAICommandBarOptions): UseAICommandBarResult {
  const {
    assistantId,
    apiKey: propsApiKey,
    baseUrl: propsBaseUrl,
    tenantId,
    tenantMetadata,
    options: barOptions = {},
    isVisible: controlledVisible,
    onVisibilityChange,
    onExecute = 'callback',
    chatDrawerRef,
    onResponse,
    modelInterfaceTools = [],
    onSubmit,
    onToolCall,
    onError,
    onOpen,
    onClose,
  } = options;

  const { shortcut } = barOptions;

  // Get context
  const context = useOptionalDevicContext();
  const apiKey = propsApiKey || context?.apiKey;
  const baseUrl = propsBaseUrl || context?.baseUrl || 'https://api.devic.ai';
  const resolvedTenantId = tenantId || context?.tenantId;
  const resolvedTenantMetadata = { ...context?.tenantMetadata, ...tenantMetadata };

  // Visibility state
  const [internalVisible, setInternalVisible] = useState(false);
  const isVisible = controlledVisible ?? internalVisible;

  // Input state
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCallSummary[]>([]);
  const [currentToolSummary, setCurrentToolSummary] = useState<string | null>(null);

  // Result state
  const [result, setResult] = useState<CommandBarResult | null>(null);
  const [chatUid, setChatUid] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Polling state
  const [shouldPoll, setShouldPoll] = useState(false);

  // History state
  const enableHistory = barOptions.enableHistory !== false; // default true
  const maxHistoryItems = barOptions.maxHistoryItems ?? 50;
  const historyStorageKey = barOptions.historyStorageKey ?? 'devic-command-bar-history';
  const showHistoryCommand = barOptions.showHistoryCommand !== false; // default true

  const [history, setHistory] = useState<string[]>(() => {
    if (!enableHistory || typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(historyStorageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showingHistory, setShowingHistory] = useState(false);
  const [tempInput, setTempInput] = useState(''); // Store current input when navigating history

  // Commands state
  const commands = barOptions.commands ?? [];
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  // Built-in history command
  const historyCommand: AICommandBarCommand = useMemo(() => ({
    keyword: 'history',
    description: 'Show command history',
    message: '', // Special handling
  }), []);

  // All available commands (user commands + built-in)
  const allCommands = useMemo(() => {
    const userCommands = commands;
    // Add history command if enabled and not overwritten
    if (showHistoryCommand && !userCommands.some(c => c.keyword === 'history')) {
      return [...userCommands, historyCommand];
    }
    return userCommands;
  }, [commands, showHistoryCommand, historyCommand]);

  // Detect if showing command suggestions
  const isCommandMode = inputValue.startsWith('/');
  const commandQuery = isCommandMode ? inputValue.slice(1).toLowerCase() : '';
  const showingCommands = isCommandMode && !isProcessing && !result;

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!showingCommands) return [];
    if (commandQuery === '') return allCommands;
    return allCommands.filter(cmd =>
      cmd.keyword.toLowerCase().includes(commandQuery) ||
      cmd.description.toLowerCase().includes(commandQuery)
    );
  }, [showingCommands, commandQuery, allCommands]);

  // Reset command selection when filtered list changes
  useEffect(() => {
    setSelectedCommandIndex(0);
  }, [filteredCommands.length]);

  // Callback refs
  const onErrorRef = useRef(onError);
  const onResponseRef = useRef(onResponse);
  const onToolCallRef = useRef(onToolCall);
  const onSubmitRef = useRef(onSubmit);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onErrorRef.current = onError;
    onResponseRef.current = onResponse;
    onToolCallRef.current = onToolCall;
    onSubmitRef.current = onSubmit;
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
    onToolExecute: onToolCall,
  });

  // Visibility controls
  const open = useCallback(() => {
    setInternalVisible(true);
    onVisibilityChange?.(true);
    onOpenRef.current?.();
    // Focus input after visibility change
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [onVisibilityChange]);

  const close = useCallback(() => {
    setInternalVisible(false);
    onVisibilityChange?.(false);
    onCloseRef.current?.();
  }, [onVisibilityChange]);

  const toggle = useCallback(() => {
    if (isVisible) {
      close();
    } else {
      open();
    }
  }, [isVisible, open, close]);

  const focus = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // Save history to localStorage
  const saveHistory = useCallback((newHistory: string[]) => {
    if (!enableHistory || typeof window === 'undefined') return;
    try {
      localStorage.setItem(historyStorageKey, JSON.stringify(newHistory));
    } catch {
      // Ignore localStorage errors
    }
  }, [enableHistory, historyStorageKey]);

  // Add item to history
  const addToHistory = useCallback((message: string) => {
    if (!enableHistory || !message.trim() || message.startsWith('/')) return;

    setHistory(prev => {
      // Don't add duplicates at the top
      const filtered = prev.filter(item => item !== message);
      const newHistory = [message, ...filtered].slice(0, maxHistoryItems);
      saveHistory(newHistory);
      return newHistory;
    });
    setHistoryIndex(-1);
  }, [enableHistory, maxHistoryItems, saveHistory]);

  // Clear history
  const clearHistory = useCallback(() => {
    setHistory([]);
    setHistoryIndex(-1);
    if (enableHistory && typeof window !== 'undefined') {
      try {
        localStorage.removeItem(historyStorageKey);
      } catch {
        // Ignore
      }
    }
  }, [enableHistory, historyStorageKey]);

  // Navigate history
  const navigateHistory = useCallback((direction: 'up' | 'down') => {
    if (!enableHistory || history.length === 0) return;

    if (direction === 'up') {
      if (historyIndex === -1) {
        // Save current input before navigating
        setTempInput(inputValue);
        setHistoryIndex(0);
        setInputValue(history[0]);
      } else if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInputValue(history[newIndex]);
      }
    } else {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInputValue(history[newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputValue(tempInput);
      }
    }
  }, [enableHistory, history, historyIndex, inputValue, tempInput]);

  // Ref to hold submit function (to avoid circular dependency)
  const submitRef = useRef<(message?: string) => Promise<void>>();

  // Select a command
  const selectCommand = useCallback((command: AICommandBarCommand) => {
    if (command.keyword === 'history') {
      // Special handling for history command
      setShowingHistory(true);
      setInputValue('');
    } else {
      // Send the command's message
      setInputValue('');
      submitRef.current?.(command.message);
    }
  }, []);

  // Navigate commands
  const navigateCommands = useCallback((direction: 'up' | 'down') => {
    if (filteredCommands.length === 0) return;

    if (direction === 'down') {
      setSelectedCommandIndex(prev =>
        prev < filteredCommands.length - 1 ? prev + 1 : 0
      );
    } else {
      setSelectedCommandIndex(prev =>
        prev > 0 ? prev - 1 : filteredCommands.length - 1
      );
    }
  }, [filteredCommands.length]);

  // Register keyboard shortcut
  useEffect(() => {
    if (!shortcut) return;

    const handler = (e: KeyboardEvent) => {
      if (matchShortcut(e, shortcut)) {
        e.preventDefault();
        toggle();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcut, toggle]);

  // Process tool calls from realtime data
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

        // Update current tool summary
        // Prefer showing an executing tool, but fall back to the last tool (completed or not)
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
          return;
        }

        if (data?.status === 'completed') {
          setIsProcessing(false);

          // Extract final assistant message
          const assistantMessages = data.chatHistory.filter(m => m.role === 'assistant');
          const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];

          if (lastAssistantMessage && chatUid) {
            const commandResult: CommandBarResult = {
              chatUid,
              message: lastAssistantMessage,
              toolCalls: processToolCalls(data.chatHistory),
            };

            setResult(commandResult);

            // Handle execution mode
            if (onExecute === 'openDrawer' && chatDrawerRef?.current) {
              chatDrawerRef.current.setChatUid(chatUid);
              chatDrawerRef.current.open();
              // Close and reset the command bar when handing off to drawer
              setResult(null);
              setToolCalls([]);
              setCurrentToolSummary(null);
              setInternalVisible(false);
              onVisibilityChange?.(false);
              onCloseRef.current?.();
            } else {
              onResponseRef.current?.(commandResult);
            }
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

  // Submit message
  const submit = useCallback(
    async (message?: string) => {
      const msg = message ?? inputValue;
      if (!msg.trim()) return;

      if (!clientRef.current) {
        const err = new Error('API client not configured. Please provide an API key.');
        setError(err);
        onErrorRef.current?.(err);
        return;
      }

      // Add to history before processing
      addToHistory(msg);

      // Clear input and start processing
      setInputValue('');
      setIsProcessing(true);
      setError(null);
      setResult(null);
      setToolCalls([]);
      setCurrentToolSummary(null);
      setShowingHistory(false);
      setHistoryIndex(-1);

      onSubmitRef.current?.(msg);

      try {
        const dto = {
          message: msg,
          chatUid: chatUid || undefined,
          metadata: resolvedTenantMetadata,
          tenantId: resolvedTenantId,
          ...(toolSchemas.length > 0 && { tools: toolSchemas }),
        };

        const response = await clientRef.current.sendMessageAsync(assistantId, dto);

        if (response.chatUid && response.chatUid !== chatUid) {
          setChatUid(response.chatUid);
        }

        setShouldPoll(true);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setIsProcessing(false);
        onErrorRef.current?.(error);
      }
    },
    [inputValue, chatUid, assistantId, resolvedTenantId, resolvedTenantMetadata, toolSchemas, addToHistory]
  );

  // Update submit ref for use in selectCommand
  submitRef.current = submit;

  // Reset state
  const reset = useCallback(() => {
    setInputValue('');
    setIsProcessing(false);
    setToolCalls([]);
    setCurrentToolSummary(null);
    setResult(null);
    setChatUid(null);
    setError(null);
    setShouldPoll(false);
  }, []);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Handle Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showingHistory) {
          setShowingHistory(false);
          return;
        }
        if (showingCommands) {
          setInputValue('');
          return;
        }
        // Reset if there's a result or if processing
        if (result || isProcessing) {
          reset();
        }
        close();
        return;
      }

      // Handle arrow keys for commands
      if (showingCommands && filteredCommands.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          navigateCommands('down');
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          navigateCommands('up');
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const selectedCommand = filteredCommands[selectedCommandIndex];
          if (selectedCommand) {
            selectCommand(selectedCommand);
          }
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          const selectedCommand = filteredCommands[selectedCommandIndex];
          if (selectedCommand) {
            setInputValue('/' + selectedCommand.keyword + ' ');
          }
          return;
        }
      }

      // Handle arrow keys for history (only when not in command mode)
      if (!showingCommands && !isProcessing) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          navigateHistory('up');
          return;
        }
        if (e.key === 'ArrowDown' && historyIndex >= 0) {
          e.preventDefault();
          navigateHistory('down');
          return;
        }
      }

      // Handle Enter to submit
      if (e.key === 'Enter' && !e.shiftKey && !isProcessing) {
        e.preventDefault();
        submit();
      }
    },
    [
      isProcessing,
      result,
      showingCommands,
      showingHistory,
      filteredCommands,
      selectedCommandIndex,
      historyIndex,
      submit,
      reset,
      close,
      navigateCommands,
      navigateHistory,
      selectCommand,
    ]
  );

  return {
    isVisible,
    open,
    close,
    toggle,
    inputValue,
    setInputValue,
    inputRef,
    focus,
    isProcessing,
    toolCalls,
    currentToolSummary,
    result,
    chatUid,
    error,
    history,
    historyIndex,
    showingHistory,
    setShowingHistory,
    showingCommands,
    filteredCommands,
    selectedCommandIndex,
    selectCommand,
    submit,
    reset,
    handleKeyDown,
    clearHistory,
  };
}

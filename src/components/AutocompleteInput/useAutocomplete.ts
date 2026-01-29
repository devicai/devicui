import { useState, useRef, useCallback, useEffect } from "react";
import { DevicApiClient } from "../../api/client";
import { storage } from "../../utils";
import type { ChatMessage } from "../../api/types";

const GLOBAL_DISABLE_KEY = "devic-autocomplete-disabled-global";
const INSTANCE_DISABLE_KEY = "devic-autocomplete-disabled-instances";

export interface UseAutocompleteOptions {
  assistantId: string;
  instanceId?: string;
  value: string;
  enabled?: boolean;
  debounceMs?: number;
  minLength?: number;
  triggerCharPattern?: RegExp;
  templateParameters?: Record<string, any>;
  tenantId?: string;
  tenantMetadata?: Record<string, any>;
  apiKey?: string;
  baseUrl?: string;
  onSuggestionReceived?: (suggestion: string) => void;
  onError?: (error: Error) => void;
}

export interface UseAutocompleteResult {
  suggestion: string;
  isLoading: boolean;
  isGloballyDisabled: boolean;
  isInstanceDisabled: boolean;
  triggerAutocomplete: (value?: string) => Promise<void>;
  acceptSuggestion: () => string;
  dismissSuggestion: () => void;
  cancelRequest: () => void;
  setGloballyDisabled: (disabled: boolean) => void;
  setInstanceDisabled: (disabled: boolean) => void;
}

/**
 * Extracts suggestion text from various response formats.
 * Handles string, JSON-wrapped, truncated JSON, and nested object responses.
 */
function extractSuggestionText(value: unknown): string {
  if (!value) return "";

  if (typeof value === "string") {
    const trimmed = value.trim();

    // Complete JSON object
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        return extractSuggestionText(JSON.parse(trimmed));
      } catch {
        // Not valid JSON, try truncated pattern
      }
    }

    // Truncated JSON: {"message":"text... or {"suggestion":"text...
    const truncatedJsonPattern =
      /^\{\s*"(message|suggestion|content|text)"\s*:\s*"(.*)$/s;
    const match = trimmed.match(truncatedJsonPattern);
    if (match) {
      let extracted = match[2];
      extracted = extracted.replace(/\\$/, "").replace(/"?\}?$/, "");
      try {
        extracted = JSON.parse(`"${extracted}"`);
      } catch {
        extracted = extracted
          .replace(/\\"/g, '"')
          .replace(/\\n/g, "\n")
          .replace(/\\t/g, "\t")
          .replace(/\\\\/g, "\\");
      }
      return extracted.trim();
    }

    return trimmed;
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if ("message" in obj) return extractSuggestionText(obj.message);
    if ("suggestion" in obj) return extractSuggestionText(obj.suggestion);
    if ("content" in obj) return extractSuggestionText(obj.content);
    if ("text" in obj) return extractSuggestionText(obj.text);
  }

  return "";
}

function extractFromMessages(messages: ChatMessage[]): string {
  if (!Array.isArray(messages)) return "";
  const last = messages.filter((m) => m.role === "assistant").pop();
  if (!last) return "";
  return extractSuggestionText(last.content);
}

function getDisabledInstances(): string[] {
  return storage.get<string[]>(INSTANCE_DISABLE_KEY, []) ?? [];
}

// Debounce hook — same pattern as MarkdownEditor
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export function useAutocomplete(
  options: UseAutocompleteOptions,
): UseAutocompleteResult {
  const {
    assistantId,
    instanceId,
    value,
    enabled = true,
    debounceMs = 500,
    minLength = 10,
    triggerCharPattern = /[\s\n.,:;!?]/,
    templateParameters,
    tenantId,
    tenantMetadata,
    apiKey,
    baseUrl,
    onSuggestionReceived,
    onError,
  } = options;

  const [suggestion, setSuggestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGloballyDisabled, setGloballyDisabledState] = useState(
    () => storage.get<boolean>(GLOBAL_DISABLE_KEY, false) ?? false,
  );
  const [isInstanceDisabled, setInstanceDisabledState] = useState(
    () => !!instanceId && getDisabledInstances().includes(instanceId),
  );

  const abortRef = useRef<AbortController | null>(null);
  const clientRef = useRef<DevicApiClient | null>(null);
  const lastRequestedRef = useRef("");
  const suggestionRef = useRef("");
  const valueRef = useRef(value);
  valueRef.current = value;

  // Keep suggestion ref in sync
  useEffect(() => {
    suggestionRef.current = suggestion;
  }, [suggestion]);

  // Refs for unstable props
  const assistantIdRef = useRef(assistantId);
  assistantIdRef.current = assistantId;
  const templateParametersRef = useRef(templateParameters);
  templateParametersRef.current = templateParameters;
  const tenantIdRef = useRef(tenantId);
  tenantIdRef.current = tenantId;
  const tenantMetadataRef = useRef(tenantMetadata);
  tenantMetadataRef.current = tenantMetadata;
  const onSuggestionReceivedRef = useRef(onSuggestionReceived);
  onSuggestionReceivedRef.current = onSuggestionReceived;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const isEffectivelyDisabled = isGloballyDisabled || isInstanceDisabled;

  // Debounce the value
  const debouncedValue = useDebounce(value, debounceMs);

  // Lazily create/update client
  const getClient = useCallback(() => {
    if (!apiKey || !baseUrl) return null;
    if (!clientRef.current) {
      clientRef.current = new DevicApiClient({ apiKey, baseUrl });
    } else {
      clientRef.current.setConfig({ apiKey, baseUrl });
    }
    return clientRef.current;
  }, [apiKey, baseUrl]);

  const cancelRequest = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsLoading(false);
  }, []);

  // Fetch suggestion — stable callback using refs
  const fetchSuggestion = useCallback(
    async (prompt: string) => {
      if (
        !prompt ||
        prompt.length < minLength ||
        !enabled ||
        isEffectivelyDisabled
      ) {
        return;
      }

      const lastChar = prompt.slice(-1);
      if (!triggerCharPattern.test(lastChar)) return;

      // Don't re-fetch for the same prompt
      if (prompt === lastRequestedRef.current) return;

      const client = getClient();
      if (!client) return;

      // Cancel previous request
      cancelRequest();

      const controller = new AbortController();
      abortRef.current = controller;
      lastRequestedRef.current = prompt;
      setIsLoading(true);

      try {
        const messages = await client.sendMessage(
          assistantIdRef.current,
          {
            skipSummarization: true,
            message: prompt,
            metadata: {
              promptTemplateParams: templateParametersRef.current,
              ...tenantMetadataRef.current,
            },
            tenantId: tenantIdRef.current,
            previousConversation: [
              {
                role: "user",
                message: `Continue this text naturally. Provide ONLY the continuation, nothing else:\n\n${prompt.slice(0, Math.floor(prompt.length / 2))}`,
              },
              {
                role: "assistant",
                message: prompt.slice(
                  Math.floor(prompt.length / 2),
                  prompt.length,
                ),
              },
            ],
          },
          controller.signal,
        );

        if (controller.signal.aborted) return;

        const text = extractFromMessages(messages).trim();
        if (text) {
          setSuggestion(text);
          onSuggestionReceivedRef.current?.(text);
        } else {
          setSuggestion("");
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        onErrorRef.current?.(
          err instanceof Error ? err : new Error(String(err)),
        );
        setSuggestion("");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [
      minLength,
      enabled,
      isEffectivelyDisabled,
      triggerCharPattern,
      getClient,
      cancelRequest,
    ],
  );

  // Trigger fetch when debounced value changes
  useEffect(() => {
    if (enabled && !isEffectivelyDisabled) {
      fetchSuggestion(debouncedValue);
    }
  }, [debouncedValue, enabled, isEffectivelyDisabled, fetchSuggestion]);

  // Clear suggestion when user is actively typing (value diverges from debounced)
  useEffect(() => {
    if (value !== debouncedValue && suggestion) {
      setSuggestion("");
    }
  }, [value, debouncedValue, suggestion]);

  const triggerAutocomplete = useCallback(
    async (overrideValue?: string) => {
      const text = overrideValue ?? valueRef.current;
      if (!text || text.length < minLength) return;
      // Bypass the duplicate guard for programmatic triggers
      lastRequestedRef.current = "";
      await fetchSuggestion(text);
    },
    [fetchSuggestion, minLength],
  );

  const acceptSuggestion = useCallback(() => {
    const s = suggestionRef.current;
    setSuggestion("");
    lastRequestedRef.current = "";
    return s;
  }, []);

  const dismissSuggestion = useCallback(() => {
    setSuggestion("");
    cancelRequest();
  }, [cancelRequest]);

  const setGloballyDisabled = useCallback((disabled: boolean) => {
    setGloballyDisabledState(disabled);
    storage.set(GLOBAL_DISABLE_KEY, disabled);
  }, []);

  const setInstanceDisabled = useCallback(
    (disabled: boolean) => {
      setInstanceDisabledState(disabled);
      if (!instanceId) return;
      const instances = getDisabledInstances();
      if (disabled && !instances.includes(instanceId)) {
        storage.set(INSTANCE_DISABLE_KEY, [...instances, instanceId]);
      } else if (!disabled) {
        storage.set(
          INSTANCE_DISABLE_KEY,
          instances.filter((id) => id !== instanceId),
        );
      }
    },
    [instanceId],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelRequest();
    };
  }, [cancelRequest]);

  return {
    suggestion,
    isLoading,
    isGloballyDisabled,
    isInstanceDisabled,
    triggerAutocomplete,
    acceptSuggestion,
    dismissSuggestion,
    cancelRequest,
    setGloballyDisabled,
    setInstanceDisabled,
  };
}

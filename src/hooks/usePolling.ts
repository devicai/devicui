import { useState, useEffect, useRef, useCallback } from 'react';
import type { RealtimeChatHistory, RealtimeStatus } from '../api/types';

export interface UsePollingOptions {
  /**
   * Polling interval in milliseconds
   * @default 1000
   */
  interval?: number;

  /**
   * Whether polling is enabled
   * @default true
   */
  enabled?: boolean;

  /**
   * Statuses that should stop polling
   * @default ['completed', 'error']
   */
  stopStatuses?: RealtimeStatus[];

  /**
   * Callback when polling stops
   */
  onStop?: (data: RealtimeChatHistory | null) => void;

  /**
   * Callback on each poll update
   */
  onUpdate?: (data: RealtimeChatHistory) => void;

  /**
   * Callback on poll error
   */
  onError?: (error: Error) => void;
}

export interface UsePollingResult {
  /**
   * Current polling data
   */
  data: RealtimeChatHistory | null;

  /**
   * Whether polling is currently active
   */
  isPolling: boolean;

  /**
   * Last error that occurred
   */
  error: Error | null;

  /**
   * Start polling
   */
  start: () => void;

  /**
   * Stop polling
   */
  stop: () => void;

  /**
   * Manually trigger a fetch
   */
  refetch: () => Promise<void>;
}

/**
 * Hook for polling real-time chat history
 *
 * @param chatUid - The chat UID to poll for
 * @param fetchFn - Function that fetches the realtime history
 * @param options - Polling options
 */
export function usePolling(
  chatUid: string | null,
  fetchFn: () => Promise<RealtimeChatHistory>,
  options: UsePollingOptions = {}
): UsePollingResult {
  const {
    interval = 1000,
    enabled = true,
    stopStatuses = ['completed', 'error'],
    onStop,
    onUpdate,
    onError,
  } = options;

  const [data, setData] = useState<RealtimeChatHistory | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  // Refs for callbacks to avoid stale closures
  const onStopRef = useRef(onStop);
  const onUpdateRef = useRef(onUpdate);
  const onErrorRef = useRef(onError);
  const fetchFnRef = useRef(fetchFn);

  useEffect(() => {
    onStopRef.current = onStop;
    onUpdateRef.current = onUpdate;
    onErrorRef.current = onError;
    fetchFnRef.current = fetchFn;
  });

  const clearPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!isMountedRef.current) return;

    try {
      const result = await fetchFnRef.current();

      if (!isMountedRef.current) return;

      setData(result);
      setError(null);
      onUpdateRef.current?.(result);

      // Check if we should stop polling
      if (stopStatuses.includes(result.status)) {
        clearPolling();
        setIsPolling(false);
        onStopRef.current?.(result);
      }
    } catch (err) {
      if (!isMountedRef.current) return;

      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onErrorRef.current?.(error);

      // Stop polling on error
      clearPolling();
      setIsPolling(false);
    }
  }, [stopStatuses, clearPolling]);

  const start = useCallback(() => {
    if (!chatUid || intervalRef.current) return;

    setIsPolling(true);
    setError(null);

    // Immediate first fetch
    fetchData();

    // Set up interval
    intervalRef.current = setInterval(fetchData, interval);
  }, [chatUid, interval, fetchData]);

  const stop = useCallback(() => {
    clearPolling();
    setIsPolling(false);
  }, [clearPolling]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  // Auto-start polling when enabled and chatUid is set
  useEffect(() => {
    if (enabled && chatUid && !isPolling) {
      start();
    }

    return () => {
      clearPolling();
    };
  }, [enabled, chatUid, start, isPolling, clearPolling]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearPolling();
    };
  }, [clearPolling]);

  return {
    data,
    isPolling,
    error,
    start,
    stop,
    refetch,
  };
}

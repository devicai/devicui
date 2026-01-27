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

  // Refs for callbacks and options to avoid stale closures and unnecessary re-renders
  const onStopRef = useRef(onStop);
  const onUpdateRef = useRef(onUpdate);
  const onErrorRef = useRef(onError);
  const fetchFnRef = useRef(fetchFn);
  const stopStatusesRef = useRef(stopStatuses);
  const intervalValueRef = useRef(interval);
  const isPollingRef = useRef(false);

  useEffect(() => {
    onStopRef.current = onStop;
    onUpdateRef.current = onUpdate;
    onErrorRef.current = onError;
    fetchFnRef.current = fetchFn;
    stopStatusesRef.current = stopStatuses;
    intervalValueRef.current = interval;
  });

  const clearPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    isPollingRef.current = false;
  }, []);

  const fetchData = useCallback(async () => {
    console.log('[usePolling] fetchData called, isMounted:', isMountedRef.current);
    if (!isMountedRef.current) return;

    try {
      console.log('[usePolling] Fetching...');
      const result = await fetchFnRef.current();
      console.log('[usePolling] Fetch result:', { status: result.status, messageCount: result.chatHistory?.length });

      if (!isMountedRef.current) return;

      setData(result);
      setError(null);
      onUpdateRef.current?.(result);

      // Check if we should stop polling
      const shouldStop = stopStatusesRef.current.includes(result.status);
      console.log('[usePolling] Should stop?', shouldStop, 'stopStatuses:', stopStatusesRef.current, 'current status:', result.status);
      if (shouldStop) {
        console.log('[usePolling] Stopping polling due to status:', result.status);
        clearPolling();
        setIsPolling(false);
        onStopRef.current?.(result);
      }
    } catch (err) {
      console.error('[usePolling] Fetch error:', err);
      if (!isMountedRef.current) return;

      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onErrorRef.current?.(error);

      // Stop polling on error
      clearPolling();
      setIsPolling(false);
    }
  }, [clearPolling]);

  const start = useCallback(() => {
    if (intervalRef.current) return;

    isPollingRef.current = true;
    setIsPolling(true);
    setError(null);

    // Immediate first fetch
    fetchData();

    // Set up interval
    intervalRef.current = setInterval(fetchData, intervalValueRef.current);
  }, [fetchData]);

  const stop = useCallback(() => {
    clearPolling();
    setIsPolling(false);
  }, [clearPolling]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  // Auto-start polling when enabled and chatUid is set
  useEffect(() => {
    console.log('[usePolling] Auto-start effect triggered:', { enabled, chatUid, isPollingRef: isPollingRef.current, intervalRef: !!intervalRef.current });

    if (!enabled || !chatUid) {
      console.log('[usePolling] Not enabled or no chatUid, stopping if active');
      // Stop polling if disabled or no chatUid
      if (isPollingRef.current) {
        clearPolling();
        setIsPolling(false);
      }
      return;
    }

    // Start polling if not already polling
    if (!isPollingRef.current) {
      console.log('[usePolling] Starting polling, interval:', intervalValueRef.current);
      isPollingRef.current = true;
      setIsPolling(true);
      setError(null);

      // Immediate first fetch
      fetchData();

      // Set up interval
      intervalRef.current = setInterval(fetchData, intervalValueRef.current);
      console.log('[usePolling] Interval set:', intervalRef.current);
    } else {
      console.log('[usePolling] Already polling, skipping start');
    }

    // Only cleanup on unmount, not on every dependency change
  }, [enabled, chatUid, fetchData, clearPolling]);

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

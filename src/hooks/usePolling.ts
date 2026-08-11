import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { RealtimeChatHistory, RealtimeStatus } from '../api/types';
import { createLogger } from '../utils/logger';

/**
 * Cadence used when nobody configures one.
 */
export const DEFAULT_POLLING_INTERVAL_MS = 1000;

/**
 * Floor applied to any configured cadence. A conversation in flight is polled
 * from every mounted component, so a value below this turns the widget into a
 * request loop against the API rather than a faster chat.
 */
export const MIN_POLLING_INTERVAL_MS = 250;

/**
 * Picks the first usable cadence out of the candidates, in priority order
 * (component prop, then provider, then the caller's own default), ignoring
 * anything that is not a positive finite number and clamping the winner to
 * `MIN_POLLING_INTERVAL_MS`.
 */
export function resolvePollingInterval(
  ...candidates: Array<number | undefined | null>
): number {
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.max(value, MIN_POLLING_INTERVAL_MS);
    }
  }
  return DEFAULT_POLLING_INTERVAL_MS;
}

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

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
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
    interval = DEFAULT_POLLING_INTERVAL_MS,
    enabled = true,
    stopStatuses = ['completed', 'error'],
    onStop,
    onUpdate,
    onError,
    debug = false,
  } = options;

  const log = useMemo(() => createLogger(debug), [debug]);
  const logRef = useRef(log);
  logRef.current = log;

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
  // Cadence the running timer was armed with, so a change can be detected.
  const armedIntervalRef = useRef<number | null>(null);

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
    armedIntervalRef.current = null;
    isPollingRef.current = false;
  }, []);

  const fetchData = useCallback(async () => {
    logRef.current.log('[usePolling] fetchData called, isMounted:', isMountedRef.current);
    if (!isMountedRef.current) return;

    try {
      logRef.current.log('[usePolling] Fetching...');
      const result = await fetchFnRef.current();
      logRef.current.log('[usePolling] Fetch result:', { status: result.status, messageCount: result.chatHistory?.length });

      if (!isMountedRef.current) return;

      setData(result);
      setError(null);
      onUpdateRef.current?.(result);

      // Check if we should stop polling
      const shouldStop = stopStatusesRef.current.includes(result.status);
      logRef.current.log('[usePolling] Should stop?', shouldStop, 'stopStatuses:', stopStatusesRef.current, 'current status:', result.status);
      if (shouldStop) {
        logRef.current.log('[usePolling] Stopping polling due to status:', result.status);
        clearPolling();
        setIsPolling(false);
        onStopRef.current?.(result);
      }
    } catch (err) {
      logRef.current.error('[usePolling] Fetch error:', err);
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
    armedIntervalRef.current = intervalValueRef.current;
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
    logRef.current.log('[usePolling] Auto-start effect triggered:', { enabled, chatUid, isPollingRef: isPollingRef.current, intervalRef: !!intervalRef.current });

    if (!enabled || !chatUid) {
      logRef.current.log('[usePolling] Not enabled or no chatUid, stopping if active');
      // Stop polling if disabled or no chatUid
      if (isPollingRef.current) {
        clearPolling();
        setIsPolling(false);
      }
      return;
    }

    // Start polling if not already polling
    if (!isPollingRef.current) {
      logRef.current.log('[usePolling] Starting polling, interval:', intervalValueRef.current);
      isPollingRef.current = true;
      setIsPolling(true);
      setError(null);

      // Immediate first fetch
      fetchData();

      // Set up interval
      armedIntervalRef.current = intervalValueRef.current;
      intervalRef.current = setInterval(fetchData, intervalValueRef.current);
      logRef.current.log('[usePolling] Interval set:', intervalRef.current);
    } else {
      logRef.current.log('[usePolling] Already polling, skipping start');
    }

    // Only cleanup on unmount, not on every dependency change
  }, [enabled, chatUid, fetchData, clearPolling]);

  // Re-arm the timer when the cadence changes while a conversation is already
  // in flight. Without this a new `interval` would only take effect on the next
  // conversation, which is not what changing a provider setting looks like.
  useEffect(() => {
    if (!isPollingRef.current || armedIntervalRef.current === null) return;
    if (armedIntervalRef.current === interval) return;

    logRef.current.log('[usePolling] Interval changed mid-flight:', {
      from: armedIntervalRef.current,
      to: interval,
    });
    if (intervalRef.current) clearInterval(intervalRef.current);
    armedIntervalRef.current = interval;
    intervalRef.current = setInterval(fetchData, interval);
  }, [interval, fetchData]);

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

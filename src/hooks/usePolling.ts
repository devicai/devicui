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
 * A stream that has carried nothing (no snapshot, no keep-alive) for this long
 * is presumed dead and reopened. The API sends a keep-alive every 15 s, so a
 * healthy connection never gets near it.
 */
export const DEFAULT_STREAM_SILENCE_MS = 30_000;

/** Pause between a stream ending (the server's lifetime) and the next one. */
export const STREAM_RECONNECT_DELAY_MS = 250;

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

/**
 * Whether a conversation in progress is followed over a server-sent event
 * stream instead of polled. Off until the integrator opts in; the flag will
 * default to on once the streaming endpoint has been exercised in the field.
 */
export const DEFAULT_STREAMING = false;

/**
 * Picks the first explicit choice out of the candidates, in priority order
 * (component prop, then provider), ignoring anything that is not a boolean
 * and falling back to `DEFAULT_STREAMING`.
 */
export function resolveStreaming(
  ...candidates: Array<boolean | undefined | null>
): boolean {
  for (const value of candidates) {
    if (typeof value === 'boolean') return value;
  }
  return DEFAULT_STREAMING;
}

export interface UsePollingOptions {
  /**
   * Opens a server-sent event stream for the conversation and feeds every
   * snapshot it carries. While the connection is open the timer below makes
   * no request at all; when the stream ends it is reopened, and only when it
   * fails does the timer take over. `onActivity` reports every chunk received
   * (keep-alives included) so a silent connection can be told from a dead one.
   * Absent, the hook only polls.
   */
  streamFn?: (
    onSnapshot: (data: RealtimeChatHistory) => Promise<void>,
    signal: AbortSignal,
    onActivity?: () => void,
  ) => Promise<void>;

  /**
   * How long (ms) an open stream may stay silent before it is presumed dead
   * and reopened.
   * @default 30000
   */
  streamSilenceMs?: number;
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
   * Consulted when the status says the conversation is done. Returning true
   * keeps the poll running and skips `onStop`.
   *
   * A run can settle while the conversation still owes an answer to something
   * queued: between one run liquidating and the follow-up run marking itself as
   * processing, the realtime state reads as finished. Stopping in that window
   * leaves the answer invisible until a reload. Whoever passes this is
   * responsible for bounding it — the hook will hold open for as long as it is
   * told to.
   */
  holdOpen?: (data: RealtimeChatHistory) => boolean;

  /**
   * Callback when polling stops
   */
  onStop?: (data: RealtimeChatHistory | null) => void;

  /**
   * Callback on each poll update
   */
  onUpdate?: (data: RealtimeChatHistory) => void | Promise<void>;

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
    holdOpen,
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
  const chatUidRef = useRef(chatUid);
  chatUidRef.current = chatUid;
  const streamFnRef = useRef(options.streamFn);
  streamFnRef.current = options.streamFn;
  const lastStreamAt = useRef(0);
  // While a stream connection is open the timer makes no request at all: the
  // stream is the source, the poll only the recovery.
  const streamAliveRef = useRef(false);
  const lastStreamActivity = useRef(0);
  const streamAttemptRef = useRef<AbortController | null>(null);
  const streamSilenceRef = useRef(options.streamSilenceMs ?? DEFAULT_STREAM_SILENCE_MS);
  streamSilenceRef.current = options.streamSilenceMs ?? DEFAULT_STREAM_SILENCE_MS;

  // Refs for callbacks and options to avoid stale closures and unnecessary re-renders
  const onStopRef = useRef(onStop);
  const holdOpenRef = useRef(holdOpen);
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
    holdOpenRef.current = holdOpen;
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

  const fetchData = useCallback(async (snapshot?: RealtimeChatHistory, force = false) => {
    logRef.current.log('[usePolling] fetchData called, isMounted:', isMountedRef.current);
    if (!isMountedRef.current) return;

    try {
      logRef.current.log('[usePolling] Fetching...');
      const started = Date.now();
      const startedChat = chatUidRef.current;
      if (!snapshot && !force && streamAliveRef.current) {
        // A stream that has gone quiet for too long is presumed dead: drop it
        // so the loop below reopens it. Until then, nothing is asked.
        if (started - lastStreamActivity.current > streamSilenceRef.current) {
          logRef.current.log('[usePolling] Stream silent for too long, reconnecting');
          streamAttemptRef.current?.abort();
        }
        return;
      }
      const result = snapshot || await fetchFnRef.current();
      if (startedChat !== chatUidRef.current) return;
      if (!snapshot && lastStreamAt.current > started) return;
      logRef.current.log('[usePolling] Fetch result:', { status: result.status, messageCount: result.chatHistory?.length });

      if (!isMountedRef.current) return;

      setData(result);
      setError(null);
      await onUpdateRef.current?.(result);

      // Check if we should stop polling
      const shouldStop =
        stopStatusesRef.current.includes(result.status) &&
        !holdOpenRef.current?.(result);
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

  useEffect(() => {
    if (!enabled || !chatUid || !isPolling || !streamFnRef.current) return;
    const controller = new AbortController();
    lastStreamAt.current = 0;
    const leave = () => {
      streamAliveRef.current = false;
      streamAttemptRef.current = null;
      lastStreamAt.current = 0;
    };
    const connect = async () => {
      while (!controller.signal.aborted && isPollingRef.current) {
        // One controller per attempt, so the silence watchdog can drop a dead
        // connection without ending the loop.
        const attempt = new AbortController();
        const abortAttempt = () => attempt.abort();
        controller.signal.addEventListener('abort', abortAttempt);
        streamAttemptRef.current = attempt;
        streamAliveRef.current = true;
        lastStreamActivity.current = Date.now();
        let failed = false;
        try {
          await streamFnRef.current!(
            async snapshot => {
              if (attempt.signal.aborted || !isPollingRef.current) return;
              lastStreamAt.current = Date.now();
              lastStreamActivity.current = lastStreamAt.current;
              await fetchData(snapshot);
            },
            attempt.signal,
            () => { lastStreamActivity.current = Date.now(); },
          );
        } catch {
          // Our own abort is a reconnect; anything else means the stream is
          // not available here, and the poll is the recovery path.
          failed = !attempt.signal.aborted;
        } finally {
          controller.signal.removeEventListener('abort', abortAttempt);
        }
        leave();
        if (failed || controller.signal.aborted) break;
        // The server closes a stream after its lifetime; reopen right away.
        await new Promise(resolve => setTimeout(resolve, STREAM_RECONNECT_DELAY_MS));
      }
      leave();
    };
    void connect();
    return () => { controller.abort(); leave(); };
  }, [enabled, chatUid, isPolling, fetchData]);

  const start = useCallback(() => {
    if (intervalRef.current) return;

    isPollingRef.current = true;
    setIsPolling(true);
    setError(null);

    // Immediate first fetch — unless a stream is about to open, whose first
    // frame is that same state.
    if (!streamFnRef.current) fetchData();

    // Set up interval
    armedIntervalRef.current = intervalValueRef.current;
    intervalRef.current = setInterval(fetchData, intervalValueRef.current);
  }, [fetchData]);

  const stop = useCallback(() => {
    clearPolling();
    setIsPolling(false);
  }, [clearPolling]);

  const refetch = useCallback(async () => {
    await fetchData(undefined, true);
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

      // Immediate first fetch — unless a stream is about to open, whose first
      // frame is that same state.
      if (!streamFnRef.current) fetchData();

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

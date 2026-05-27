import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Recording lifecycle state.
 * - `idle`: not recording
 * - `recording`: actively capturing audio
 * - `paused`: capture paused, can be resumed
 */
export type SpeechRecordingStatus = 'idle' | 'recording' | 'paused';

export interface UseSpeechRecordingOptions {
  /** Number of equalizer bars to expose in `levels`. @default 5 */
  bars?: number;
  /** Preferred MediaRecorder mime type. Falls back to a supported one. */
  mimeType?: string;
  /**
   * Auto-stop the recording after a short silence, but only once speech has
   * actually been detected. When it triggers, the countdown runs and then
   * `onAutoStop` is fired. Disable to require a manual confirm. @default true
   */
  autoStop?: boolean;
  /**
   * Continuous silence (ms) that must elapse — after speech was detected —
   * before the auto-stop countdown begins. @default 1000
   */
  autoStopSilenceMs?: number;
  /** Duration (ms) of the auto-stop countdown shown before firing. @default 1000 */
  autoStopCountdownMs?: number;
  /** Normalized peak level (0..1) at/below which audio is treated as silence. @default 0.04 */
  autoStopSilenceLevel?: number;
  /** Normalized peak level (0..1) above which we consider the user has spoken. @default 0.12 */
  autoStopSpeechLevel?: number;
  /**
   * Fired when the silence countdown completes. The consumer decides what
   * "stop" means (e.g. confirm + transcribe). Read fresh on every frame, so it
   * does not need to be memoized.
   */
  onAutoStop?: () => void;
}

export interface UseSpeechRecordingResult {
  status: SpeechRecordingStatus;
  isRecording: boolean;
  isPaused: boolean;
  /** Whether the browser supports audio recording. */
  isSupported: boolean;
  /** Normalized amplitude per bar (0..1), updated in real time for the equalizer. */
  levels: number[];
  /** Elapsed recording time in milliseconds (excludes paused time). */
  durationMs: number;
  /** Last error message, if any (e.g. permission denied). */
  error: string | null;
  /** True while the silence-triggered auto-stop countdown is running. */
  isAutoStopping: boolean;
  /** Auto-stop countdown progress, 1 (full) → 0 (empty), for an inverted ring. */
  autoStopProgress: number;
  /** Request mic access and start recording. */
  start: () => Promise<void>;
  /** Pause an active recording. */
  pause: () => void;
  /** Resume a paused recording. */
  resume: () => void;
  /** Stop and return the recorded audio as a Blob (null if nothing captured). */
  stop: () => Promise<Blob | null>;
  /** Stop and discard the recording without producing a Blob. */
  cancel: () => void;
}

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

function pickMimeType(preferred?: string): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = preferred
    ? [preferred, ...PREFERRED_MIME_TYPES]
    : PREFERRED_MIME_TYPES;
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

/**
 * Encapsulates microphone capture via MediaRecorder plus a Web Audio analyser
 * that exposes live amplitude levels for an equalizer-style animation.
 *
 * The hook owns all teardown: stopping tracks, closing the AudioContext and
 * cancelling the animation frame on stop/cancel/unmount.
 */
export function useSpeechRecording(
  options: UseSpeechRecordingOptions = {},
): UseSpeechRecordingResult {
  const {
    bars = 5,
    mimeType,
    autoStop = true,
    autoStopSilenceMs = 1000,
    autoStopCountdownMs = 1000,
    autoStopSilenceLevel = 0.04,
    autoStopSpeechLevel = 0.12,
    onAutoStop,
  } = options;

  const isSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  const [status, setStatus] = useState<SpeechRecordingStatus>('idle');
  const [levels, setLevels] = useState<number[]>(() => new Array(bars).fill(0));
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isAutoStopping, setIsAutoStopping] = useState(false);
  const [autoStopProgress, setAutoStopProgress] = useState(1);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const accumulatedRef = useRef<number>(0);
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const discardRef = useRef<boolean>(false);

  // --- Auto-stop (silence detection) state, all kept in refs so the rAF loop
  // reads it without forcing `tick` to re-subscribe. ---
  const hasSpeechRef = useRef(false); // user has spoken at least once
  const silenceStartRef = useRef<number | null>(null); // when current silence began
  const autoStopStartRef = useRef<number | null>(null); // when the countdown started
  const autoStopFiredRef = useRef(false); // guard against re-firing before stop
  // Latest-config ref so the loop always sees fresh thresholds and callback.
  const autoStopCfgRef = useRef({
    autoStop,
    autoStopSilenceMs,
    autoStopCountdownMs,
    autoStopSilenceLevel,
    autoStopSpeechLevel,
    onAutoStop,
  });
  autoStopCfgRef.current = {
    autoStop,
    autoStopSilenceMs,
    autoStopCountdownMs,
    autoStopSilenceLevel,
    autoStopSpeechLevel,
    onAutoStop,
  };

  // Reset all auto-stop tracking. `keepSpeech` preserves the "user has spoken"
  // flag across a pause/resume so it doesn't re-arm from scratch.
  const resetAutoStop = useCallback((keepSpeech = false) => {
    if (!keepSpeech) hasSpeechRef.current = false;
    silenceStartRef.current = null;
    autoStopStartRef.current = null;
    autoStopFiredRef.current = false;
    setIsAutoStopping(false);
    setAutoStopProgress(1);
  }, []);

  // Evaluate the current peak amplitude against the silence/speech thresholds
  // and drive the auto-stop countdown. Called once per animation frame.
  const evaluateAutoStop = useCallback((peak: number) => {
    const cfg = autoStopCfgRef.current;
    if (!cfg.autoStop || autoStopFiredRef.current) return;
    const now = Date.now();

    if (peak >= cfg.autoStopSpeechLevel) {
      // Speaking: remember it and cancel any pending silence/countdown.
      hasSpeechRef.current = true;
      silenceStartRef.current = null;
      if (autoStopStartRef.current !== null) {
        autoStopStartRef.current = null;
        setIsAutoStopping(false);
        setAutoStopProgress(1);
      }
      return;
    }

    // Only ever arm once the user has actually spoken.
    if (!hasSpeechRef.current) return;

    if (peak <= cfg.autoStopSilenceLevel) {
      if (silenceStartRef.current === null) silenceStartRef.current = now;

      if (autoStopStartRef.current === null) {
        // Waiting out the silence window before the countdown begins.
        if (now - silenceStartRef.current >= cfg.autoStopSilenceMs) {
          autoStopStartRef.current = now;
          setIsAutoStopping(true);
          setAutoStopProgress(1);
        }
      } else {
        // Countdown running: drain the ring 1 → 0, then fire.
        const elapsed = now - autoStopStartRef.current;
        const progress = Math.max(0, 1 - elapsed / cfg.autoStopCountdownMs);
        setAutoStopProgress(progress);
        if (elapsed >= cfg.autoStopCountdownMs) {
          autoStopFiredRef.current = true;
          autoStopStartRef.current = null;
          silenceStartRef.current = null;
          setIsAutoStopping(false);
          setAutoStopProgress(1);
          cfg.onAutoStop?.();
        }
      }
    }
    // Deadzone (silence < peak < speech): keep the timers running as-is.
  }, []);

  const cleanupAudioGraph = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Drives both the equalizer levels and the duration counter.
  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    if (analyser) {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const bucketSize = Math.floor(data.length / bars) || 1;
      const next: number[] = [];
      let peak = 0;
      for (let i = 0; i < bars; i++) {
        let sum = 0;
        for (let j = 0; j < bucketSize; j++) {
          sum += data[i * bucketSize + j] ?? 0;
        }
        // Normalize 0..255 -> 0..1 with a small floor so bars stay visible.
        const level = Math.min(1, sum / bucketSize / 255);
        next.push(level);
        if (level > peak) peak = level;
      }
      setLevels(next);
      evaluateAutoStop(peak);
    }
    setDurationMs(accumulatedRef.current + (Date.now() - startedAtRef.current));
    rafRef.current = requestAnimationFrame(tick);
  }, [bars, evaluateAutoStop]);

  const start = useCallback(async () => {
    if (!isSupported) {
      setError('Audio recording is not supported in this browser');
      return;
    }
    if (mediaRecorderRef.current) return;

    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const selectedType = pickMimeType(mimeType);
      const recorder = selectedType
        ? new MediaRecorder(stream, { mimeType: selectedType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      discardRef.current = false;
      resetAutoStop();

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || selectedType || 'audio/webm';
        const blob = discardRef.current
          ? null
          : new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        cleanupAudioGraph();
        mediaRecorderRef.current = null;
        setStatus('idle');
        setLevels(new Array(bars).fill(0));
        setDurationMs(0);
        accumulatedRef.current = 0;
        resetAutoStop();
        const resolve = stopResolveRef.current;
        stopResolveRef.current = null;
        resolve?.(blob);
      };

      // Web Audio analyser for the equalizer animation.
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioContext = new AudioCtx();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      accumulatedRef.current = 0;
      startedAtRef.current = Date.now();
      recorder.start(100);
      setStatus('recording');
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      cleanupAudioGraph();
      mediaRecorderRef.current = null;
      const message =
        (e as Error)?.name === 'NotAllowedError'
          ? 'Microphone permission denied'
          : `Could not start recording: ${(e as Error)?.message || 'unknown error'}`;
      setError(message);
      setStatus('idle');
    }
  }, [isSupported, mimeType, bars, tick, cleanupAudioGraph, resetAutoStop]);

  const pause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.pause();
      accumulatedRef.current += Date.now() - startedAtRef.current;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setLevels(new Array(bars).fill(0));
      // Drop any in-flight silence/countdown but remember that speech happened.
      resetAutoStop(true);
      setStatus('paused');
    }
  }, [bars, resetAutoStop]);

  const resume = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'paused') {
      recorder.resume();
      startedAtRef.current = Date.now();
      // Fresh silence timing on resume so it doesn't fire immediately.
      resetAutoStop(true);
      rafRef.current = requestAnimationFrame(tick);
      setStatus('recording');
    }
  }, [tick, resetAutoStop]);

  const stop = useCallback((): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return Promise.resolve(null);
    discardRef.current = false;
    return new Promise<Blob | null>((resolve) => {
      stopResolveRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      cleanupAudioGraph();
      setStatus('idle');
      setLevels(new Array(bars).fill(0));
      setDurationMs(0);
      resetAutoStop();
      return;
    }
    discardRef.current = true;
    recorder.stop();
  }, [bars, cleanupAudioGraph, resetAutoStop]);

  // Teardown on unmount.
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        discardRef.current = true;
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
      cleanupAudioGraph();
    };
  }, [cleanupAudioGraph]);

  return {
    status,
    isRecording: status === 'recording',
    isPaused: status === 'paused',
    isSupported,
    levels,
    durationMs,
    error,
    isAutoStopping,
    autoStopProgress,
    start,
    pause,
    resume,
    stop,
    cancel,
  };
}

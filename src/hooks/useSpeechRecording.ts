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
  const { bars = 5, mimeType } = options;

  const isSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  const [status, setStatus] = useState<SpeechRecordingStatus>('idle');
  const [levels, setLevels] = useState<number[]>(() => new Array(bars).fill(0));
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
      for (let i = 0; i < bars; i++) {
        let sum = 0;
        for (let j = 0; j < bucketSize; j++) {
          sum += data[i * bucketSize + j] ?? 0;
        }
        // Normalize 0..255 -> 0..1 with a small floor so bars stay visible.
        next.push(Math.min(1, sum / bucketSize / 255));
      }
      setLevels(next);
    }
    setDurationMs(accumulatedRef.current + (Date.now() - startedAtRef.current));
    rafRef.current = requestAnimationFrame(tick);
  }, [bars]);

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
  }, [isSupported, mimeType, bars, tick, cleanupAudioGraph]);

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
      setStatus('paused');
    }
  }, [bars]);

  const resume = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'paused') {
      recorder.resume();
      startedAtRef.current = Date.now();
      rafRef.current = requestAnimationFrame(tick);
      setStatus('recording');
    }
  }, [tick]);

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
      return;
    }
    discardRef.current = true;
    recorder.stop();
  }, [bars, cleanupAudioGraph]);

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
    start,
    pause,
    resume,
    stop,
    cancel,
  };
}

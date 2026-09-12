import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslations } from '../../i18n';
import type { UseDevicLiveVoiceResult } from '../../hooks/useDevicLiveVoice';

export interface LiveVoicePrompterProps {
  voice: Pick<UseDevicLiveVoiceResult, 'transcript' | 'input' | 'output' | 'muted' | 'state'>;
}

/** Level readings kept per wave: one bar each, spread over the whole width. */
const WAVE_HISTORY = 160;
/** A new reading this often, so 160 bars are eight seconds of conversation. */
const WAVE_TICK_MS = 50;
/** Silence draws a dotted baseline rather than nothing, so the row reads as "live, quiet". */
const WAVE_FLOOR = 0.06;

/** Loudness of the last analyser window, 0..1: RMS rather than peak, so a click does not spike. */
export function waveLevel(samples: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = (samples[i] - 128) / 128;
    sum += value * value;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

/**
 * A full-width level history for one speaker: newest at the right, sliding
 * left. Drawn in the row's CSS `color`, so the user's wave takes the muted grey
 * and the assistant's the accent, and the two rows in parallel show who spoke
 * when without a legend. Analyses existing streams only: never acquires a
 * microphone or routes audio.
 */
function VoiceWave({ stream, role }: { stream?: MediaStream; role: 'user' | 'assistant' }) {
  const t = useTranslations();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let drawing: CanvasRenderingContext2D | null;
    try { drawing = canvas.getContext('2d'); } catch { return; }
    if (!drawing) return;
    let context: AudioContext | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    let analyser: AnalyserNode | undefined;
    let frame = 0;
    let tick = -Infinity;
    let color = '';
    const levels = new Float32Array(WAVE_HISTORY);
    const samples = new Uint8Array(256);
    try {
      if (stream && typeof AudioContext !== 'undefined') {
        context = new AudioContext(); source = context.createMediaStreamSource(stream);
        analyser = context.createAnalyser(); analyser.fftSize = 256;
        source.connect(analyser); void context.resume().catch(() => {});
      }
    } catch { /* A visualisation failure must not interrupt the call. */ }
    const fit = () => {
      const ratio = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
      canvas.width = Math.max(1, Math.round((canvas.clientWidth || canvas.width) * ratio));
      canvas.height = Math.max(1, Math.round((canvas.clientHeight || canvas.height) * ratio));
    };
    const draw = (now: number) => {
      if (now - tick >= WAVE_TICK_MS) {
        tick = now; samples.fill(128);
        try { analyser?.getByteTimeDomainData(samples); } catch { /* Closed stream. */ }
        levels.copyWithin(0, 1); levels[WAVE_HISTORY - 1] = waveLevel(samples);
        color = typeof getComputedStyle === 'function' ? getComputedStyle(canvas).color : '';
      }
      const { width, height } = canvas;
      drawing!.clearRect(0, 0, width, height);
      drawing!.strokeStyle = color || '#8c8c8c';
      drawing!.lineCap = 'round';
      const step = width / WAVE_HISTORY;
      const bar = Math.max(1, step * 0.5);
      drawing!.lineWidth = bar;
      const middle = height / 2;
      for (let i = 0; i < WAVE_HISTORY; i++) {
        const tall = Math.max(0, Math.max(WAVE_FLOOR, levels[i]) * (height - bar) - bar);
        const x = i * step + step / 2;
        drawing!.globalAlpha = 0.3 + 0.7 * (i / WAVE_HISTORY);
        drawing!.beginPath(); drawing!.moveTo(x, middle - tall / 2);
        drawing!.lineTo(x, middle + tall / 2); drawing!.stroke();
      }
      drawing!.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    fit();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : undefined;
    observer?.observe(canvas); frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame); observer?.disconnect(); source?.disconnect(); analyser?.disconnect();
      if (context) void context.close().catch(() => {});
      try { drawing!.clearRect(0, 0, canvas.width, canvas.height); } catch { /* Detached canvas. */ }
    };
  }, [stream, role]);
  return <div className={`devic-voice-wave-row devic-voice-wave-row--${role}`}>
    <span>{role === 'user' ? t('You') : t('Assistant')}</span>
    <canvas ref={canvasRef} className="devic-voice-wave-canvas" width={640} height={28} role="img"
      aria-label={role === 'user' ? t('Your audio level') : t('Assistant audio level')} />
  </div>;
}

/**
 * The transcript as a teleprompter, matching Active Chat: the newest words sit
 * at the bottom of a fixed-height viewport and everything earlier slides up and
 * fades out through the top edge; below it, one level wave per speaker.
 */
export function LiveVoicePrompter({ voice }: LiveVoicePrompterProps) {
  const t = useTranslations();
  const viewport = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const update = () => {
      if (text.current && viewport.current) text.current.style.transform = `translateY(-${Math.max(0, text.current.scrollHeight - viewport.current.clientHeight)}px)`;
    };
    update();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : undefined;
    if (viewport.current) observer?.observe(viewport.current);
    if (text.current) observer?.observe(text.current);
    return () => observer?.disconnect();
  }, [voice.transcript]);
  const placeholder = voice.state === 'connecting' ? t('Connecting voice…') : voice.state === 'closing' ? t('Closing voice…') : voice.state === 'reconnecting' ? t('Restoring voice…') : t('Listening…');
  return <div className="devic-voice-prompter" aria-label={t('Live voice conversation')}>
    <div ref={viewport} className="devic-voice-prompter-viewport" aria-live="polite">
      <div ref={text} className="devic-voice-prompter-text">
        {voice.transcript.length ? voice.transcript.slice(-4).map((turn, i, turns) =>
          <p key={i} className={`devic-voice-turn${i === turns.length - 1 ? ' devic-voice-turn--current' : ''}`}>
            <span>{turn.role === 'user' ? t('You') : t('Assistant')}</span>{turn.text.replace(/\s+/g, ' ')}
          </p>) : <p className="devic-voice-turn devic-voice-turn--placeholder">{placeholder}</p>}
      </div>
    </div>
    <div className="devic-voice-waves">
      <VoiceWave role="user" stream={voice.muted ? undefined : voice.input} />
      <VoiceWave role="assistant" stream={voice.output} />
    </div>
  </div>;
}

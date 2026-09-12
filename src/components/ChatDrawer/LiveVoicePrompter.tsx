import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslations } from '../../i18n';
import type { UseDevicLiveVoiceResult } from '../../hooks/useDevicLiveVoice';

export interface LiveVoicePrompterProps {
  voice: Pick<UseDevicLiveVoiceResult, 'transcript' | 'input' | 'output' | 'muted' | 'state'>;
}

/** Analyse existing streams only: never acquire a microphone or route audio. */
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
    const levels = new Float32Array(160);
    const samples = new Uint8Array(256);
    try {
      if (stream && typeof AudioContext !== 'undefined') {
        context = new AudioContext(); source = context.createMediaStreamSource(stream);
        analyser = context.createAnalyser(); analyser.fftSize = 256;
        source.connect(analyser); void context.resume().catch(() => {});
      }
    } catch { /* A visualisation failure must not interrupt the call. */ }
    const fit = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    };
    const draw = (now: number) => {
      if (now - tick >= 50) {
        tick = now; samples.fill(128);
        try { analyser?.getByteTimeDomainData(samples); } catch { /* Closed stream. */ }
        let sum = 0;
        for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
        levels.copyWithin(0, 1); levels[159] = Math.min(1, Math.sqrt(sum / samples.length) * 4);
        const { width, height } = canvas;
        drawing!.clearRect(0, 0, width, height);
        drawing!.strokeStyle = getComputedStyle(canvas).color;
        drawing!.lineCap = 'round'; drawing!.lineWidth = Math.max(1, width / 320);
        for (let i = 0; i < levels.length; i++) {
          const bar = Math.max(1, levels[i] * (height - 2));
          const x = (i + .5) * width / levels.length;
          drawing!.globalAlpha = .3 + .7 * i / levels.length;
          drawing!.beginPath(); drawing!.moveTo(x, (height - bar) / 2);
          drawing!.lineTo(x, (height + bar) / 2); drawing!.stroke();
        }
      }
      frame = requestAnimationFrame(draw);
    };
    fit();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : undefined;
    observer?.observe(canvas); frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame); observer?.disconnect(); source?.disconnect(); analyser?.disconnect();
      if (context) void context.close().catch(() => {});
    };
  }, [stream]);
  return <div className={`devic-voice-wave-row devic-voice-wave-row--${role}`}>
    <span>{role === 'user' ? t('You') : t('Assistant')}</span>
    <canvas ref={canvasRef} className="devic-voice-wave-canvas" width={640} height={28} role="img"
      aria-label={role === 'user' ? t('Your audio level') : t('Assistant audio level')} />
  </div>;
}

/** Fixed-height, bottom-following transcript, matching Active Chat's prompter. */
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

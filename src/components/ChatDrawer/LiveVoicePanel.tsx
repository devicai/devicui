import { useEffect, useRef, useState } from 'react';
import type { UseDevicLiveVoiceResult } from '../../hooks/useDevicLiveVoice';
import type { DevicApiClient } from '../../api/client';
import type { LiveVoiceRecording } from '../../api/liveVoice.types';
import { useTranslations } from '../../i18n';
import './LiveVoicePanel.css';

function VoiceLine({ text, stream, role }: { text: string; stream?: MediaStream; role: 'user' | 'assistant' }) {
  const t = useTranslations();
  const line = useRef<HTMLSpanElement>(null);
  const meter = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = line.current;
    if (!node) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    node.scrollTo?.({ left: node.scrollWidth, behavior: reduced ? 'auto' : 'smooth' });
  }, [text]);
  useEffect(() => {
    meter.current?.style.setProperty('--devic-voice-level', '0');
    if (!stream || typeof AudioContext === 'undefined') return;
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser(); analyser.fftSize = 256;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const draw = () => {
      analyser.getByteTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
      meter.current?.style.setProperty('--devic-voice-level', String(Math.min(1, rms * 6)));
      frame = requestAnimationFrame(draw);
    };
    void context.resume().catch(() => {}); draw();
    return () => { cancelAnimationFrame(frame); source.disconnect(); analyser.disconnect(); void context.close().catch(() => {}); };
  }, [stream]);
  return <div className={`devic-voice-line devic-voice-line--${role}`}>
    <span>{role === 'user' ? t('You') : t('Assistant')}</span>
    <div ref={meter} className="devic-voice-wave" aria-hidden="true">{[.4, .7, 1, .6, .9, .5, .8].map((height, i) => <i key={i} style={{ height: `${height * 100}%` }} />)}</div>
    <span ref={line} className="devic-voice-prompter" title={text}>{text || t('Listening…')}</span>
  </div>;
}

export default function LiveVoicePanel({ voice, client, assistantId, chatUid, canStart, recordSessions }: {
  voice: UseDevicLiveVoiceResult; client: DevicApiClient | null; assistantId: string; chatUid: string | null;
  canStart: boolean; recordSessions?: boolean;
}) {
  const t = useTranslations();
  const [showRecordings, setShowRecordings] = useState(false);
  const [records, setRecords] = useState<LiveVoiceRecording[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState<string>();
  const request = useRef(0);
  useEffect(() => { if (voice.active) setAudioUrl(undefined); }, [voice.active]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  useEffect(() => {
    request.current++; setRecords([]); setShowRecordings(false); setAudioUrl(undefined); setLoading(false); setError('');
    return () => { request.current++; };
  }, [client, assistantId, chatUid]);
  const list = async (offset = 0) => {
    if (!client || !chatUid || loading) return;
    const ticket = ++request.current;
    setLoading(true); setError('');
    try {
      const page = await client.getLiveRecordings(assistantId, chatUid, offset, 20);
      if (ticket !== request.current) return;
      setRecords(previous => offset ? [...previous, ...page] : page); setHasMore(page.length === 20); setShowRecordings(true);
    } catch { if (ticket === request.current) setError(t('Could not load voice recordings.')); }
    finally { if (ticket === request.current) setLoading(false); }
  };
  const playRecording = async (record: LiveVoiceRecording) => {
    if (!client || !chatUid || loading) return;
    const ticket = ++request.current; setLoading(true); setError('');
    try {
      const blob = await client.getLiveRecordingAudio(assistantId, chatUid, record.sessionId);
      if (ticket === request.current) setAudioUrl(URL.createObjectURL(blob));
    } catch { if (ticket === request.current) setError(t('Could not load voice recordings.')); }
    finally { if (ticket === request.current) setLoading(false); }
  };
  const last = (role: 'user' | 'assistant') => [...voice.transcript].reverse().find(turn => turn.role === role)?.text || '';
  return <section className="devic-live-voice" aria-label={t('Voice mode')}>
    {voice.active && <div className="devic-voice-lines">
      <VoiceLine role="user" text={last('user')} stream={voice.muted ? undefined : voice.input} />
      <VoiceLine role="assistant" text={last('assistant')} stream={voice.output} />
    </div>}
    <div className="devic-voice-controls">
      <span role="status">{voice.active
        ? voice.state === 'connected' ? t('Live · {seconds} s · included minutes', { seconds: Math.floor(voice.seconds) })
          : voice.state === 'reconnecting' ? t('Restoring voice…') : voice.state === 'closing' ? t('Closing voice…') : t('Connecting voice…')
        : t('Voice · included minutes')}</span>
      {voice.active ? <>
        <button type="button" aria-pressed={voice.muted} onClick={() => voice.mute(!voice.muted)}>{voice.muted ? t('Unmute') : t('Mute')}</button>
        <button type="button" onClick={() => void voice.stop()}>{t('End voice')}</button>
      </> : <button type="button" disabled={!canStart} onClick={() => void voice.start()}>{t('Start voice')}</button>}
      {voice.playbackBlocked && <button type="button" onClick={() => void voice.play()}>{t('Enable audio')}</button>}
    </div>
    {!voice.active && recordSessions !== false && <small>{t('Voice sessions are recorded according to the assistant settings.')}</small>}
    {voice.error && <div role="alert">{t(voice.error.message)}</div>}
    {!voice.active && chatUid && <button type="button" disabled={loading} onClick={() => showRecordings ? setShowRecordings(false) : void list()}>{showRecordings ? t('Hide recordings') : t('Voice recordings')}</button>}
    {showRecordings && !voice.active && <div className="devic-voice-recordings">
      {!records.length && <span>{t('No voice recordings yet.')}</span>}
      {records.map(record => <div key={record.sessionId}>
        <button type="button" disabled={record.status !== 'ready' || loading} onClick={() => void playRecording(record)}>
          {t('Play recording')} · {new Date(record.startedAt).toLocaleString()}{record.partial ? ` · ${t('Partial')}` : ''}
        </button>
      </div>)}
      {hasMore && <button type="button" disabled={loading} onClick={() => void list(records.length)}>{t('Load more')}</button>}
      {audioUrl && <><audio controls src={audioUrl} /><a href={audioUrl} download={`${chatUid}-voice.wav`}>{t('Download recording')}</a></>}
    </div>}
    {error && <div role="alert">{error}</div>}
  </section>;
}

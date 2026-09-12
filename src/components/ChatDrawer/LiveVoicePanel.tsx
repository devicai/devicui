import { useEffect, useRef, useState } from 'react';
import type { UseDevicLiveVoiceResult } from '../../hooks/useDevicLiveVoice';
import type { DevicApiClient } from '../../api/client';
import type { LiveVoiceRecording } from '../../api/liveVoice.types';
import { useTranslations } from '../../i18n';
import './LiveVoicePanel.css';
import { LiveVoicePrompter } from './LiveVoicePrompter';

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
  return <section className={`devic-live-voice devic-live-voice--${voice.active ? 'active' : 'idle'}`} aria-label={t('Voice mode')}>
    {voice.active && <LiveVoicePrompter voice={voice} />}
    <div className="devic-voice-controls">
      <span role="status"><i className={`devic-voice-status-dot${voice.state === 'connected' ? ' devic-voice-status-dot--live' : ''}`} aria-hidden="true" />{voice.active
        ? voice.state === 'connected' ? t('Live · {seconds} s · included minutes', { seconds: Math.floor(voice.seconds) })
          : voice.state === 'reconnecting' ? t('Restoring voice…') : voice.state === 'closing' ? t('Closing voice…') : t('Connecting voice…')
        : t('Voice · included minutes')}</span>
      {voice.active ? <>
        <button type="button" aria-pressed={voice.muted} onClick={() => voice.mute(!voice.muted)}>{voice.muted ? t('Unmute') : t('Mute')}</button>
        <button className="devic-voice-end" type="button" disabled={voice.state === 'closing'} onClick={() => void voice.stop()}>{t('End voice')}</button>
      </> : <button className="devic-voice-start" type="button" disabled={!canStart} onClick={() => void voice.start()}>{t('Start voice')}</button>}
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

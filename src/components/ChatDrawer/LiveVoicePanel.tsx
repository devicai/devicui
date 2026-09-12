import type { ReactNode } from 'react';
import type { UseDevicLiveVoiceResult } from '../../hooks/useDevicLiveVoice';
import { useTranslations } from '../../i18n';
import './LiveVoicePanel.css';
import { LiveVoicePrompter } from './LiveVoicePrompter';

export interface LiveVoicePanelProps {
  voice: UseDevicLiveVoiceResult;
  canStart: boolean;
  recordSessions?: boolean;
  /** Rendered above the call box while voice is active: the composer's own banners. */
  children?: ReactNode;
}

/** `m:ss` of a running call, as the dictation timer formats it. */
function formatSeconds(total: number): string {
  const seconds = Math.max(0, Math.floor(total));
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}

/**
 * The live voice widget. Idle, it is an invitation card sitting above the
 * composer of a new conversation; once a call starts it takes the composer's
 * place — the same input area, the same rounded surface — with the transcript
 * prompter, one wave per speaker and the call controls where the send button
 * normally sits.
 */
export default function LiveVoicePanel({ voice, canStart, recordSessions, children }: LiveVoicePanelProps) {
  const t = useTranslations();

  if (voice.active) {
    const status = voice.state === 'connected' ? t('Live · {time}', { time: formatSeconds(voice.seconds) })
      : voice.state === 'reconnecting' ? t('Restoring voice…') : voice.state === 'closing' ? t('Closing voice…') : t('Connecting voice…');
    return <div className="devic-input-area devic-voice-area" data-voice-state={voice.state}>
      {children}
      <section className="devic-voice-box" aria-label={t('Voice mode')}>
        <LiveVoicePrompter voice={voice} />
        <div className="devic-voice-bar">
          <span className="devic-voice-status" role="status"><i className="devic-voice-status-dot" aria-hidden="true" />{status}</span>
          {voice.playbackBlocked && <button type="button" className="devic-voice-text-btn" onClick={() => void voice.play()}>{t('Enable audio')}</button>}
          {voice.state === 'connecting'
            ? <button type="button" className="devic-voice-text-btn" onClick={() => void voice.stop()}>{t('Cancel')}</button>
            : <>
              <button type="button" className="devic-input-btn devic-voice-mute" aria-pressed={voice.muted} disabled={voice.state !== 'connected'}
                title={voice.muted ? t('Unmute') : t('Mute')} aria-label={voice.muted ? t('Unmute') : t('Mute')} onClick={() => voice.mute(!voice.muted)}>
                {voice.muted ? <MicOffIcon /> : <MicIcon />}
              </button>
              <button type="button" className="devic-voice-end" disabled={voice.state === 'closing'} onClick={() => void voice.stop()}>
                <HangUpIcon />{t('End voice')}
              </button>
            </>}
        </div>
      </section>
    </div>;
  }

  return <section className="devic-live-voice" aria-label={t('Voice mode')}>
    <div className="devic-voice-card">
      <span className="devic-voice-card-icon" aria-hidden="true"><MicIcon /></span>
      <div className="devic-voice-card-copy">
        <div className="devic-voice-card-title">{t('Voice mode')}</div>
        <div className="devic-voice-card-subtitle">
          {t('Talk to the assistant in real time.')}{recordSessions !== false && <> {t('Voice sessions are recorded according to the assistant settings.')}</>}
        </div>
      </div>
      <button className="devic-voice-start" type="button" disabled={!canStart} onClick={() => void voice.start()}><MicIcon />{t('Start voice')}</button>
    </div>
    {voice.error && <div className="devic-voice-error" role="alert">{t(voice.error.message)}</div>}
  </section>;
}

function MicIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
  </svg>;
}
function MicOffIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
  </svg>;
}
function HangUpIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
  </svg>;
}

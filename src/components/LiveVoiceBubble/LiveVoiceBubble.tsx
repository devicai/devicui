import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useOptionalDevicContext } from '../../provider';
import { DevicApiClient } from '../../api/client';
import { useAssistantInfo } from '../../api/assistantInfo';
import { useDevicLiveVoice } from '../../hooks/useDevicLiveVoice';
import { LiveVoicePrompter } from '../ChatDrawer/LiveVoicePrompter';
import { DevicTranslationsProvider, useTranslations } from '../../i18n';
import { isDarkTheme, themeVars } from '../theme';
import { avatarUri } from '../../utils/avatar';
import type { LiveVoiceContext } from '../../api/liveVoice.types';
import type { LiveVoiceBubbleHandle, LiveVoiceBubbleProps, LiveVoiceCallSummary } from './LiveVoiceBubble.types';
import '../ChatDrawer/LiveVoicePanel.css';
import './LiveVoiceBubble.css';

/** `m:ss`, as the call box in the drawer formats it. */
function formatSeconds(total: number): string {
  const seconds = Math.max(0, Math.floor(total));
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}
const css = (value: number | string) => (typeof value === 'number' ? `${value}px` : value);

/**
 * A voice call to one assistant, as a bubble.
 *
 * Idle, it is a round button — floating in a corner of the page or sitting
 * wherever the host puts it. Pressing it starts the call and opens a small
 * panel next to it: the assistant's name and the live status, the transcript
 * as a teleprompter that slides upward, one audio wave per speaker and, in the
 * centre, the call controls as a phone shows them. The bubble can be pressed
 * again to tuck the panel away while the call goes on; the elapsed time then
 * shows beside it. Once the call ends the panel offers to continue the
 * conversation in the ChatDrawer registered on the provider, or to close.
 */
export const LiveVoiceBubble = forwardRef<LiveVoiceBubbleHandle, LiveVoiceBubbleProps>(function LiveVoiceBubble(props, ref) {
  const { assistantId, apiKey, baseUrl, tenantId, tenantMetadata, subtenantId, subtenantMetadata, tags, enabledTools, disabledIntegrations,
    placement = 'floating', side = 'right', offset = 24, panelSide = 'above', size = 56, zIndex = 1000, label, title, avatarUrl, icon,
    theme, translations, disabled, className, style, onOpenInChat } = props;
  const t = useTranslations(translations);
  const context = useOptionalDevicContext();
  const latest = useRef(props); latest.current = props;

  const resolvedApiKey = apiKey || context?.apiKey;
  const getTenantSession = context?.getTenantSession;
  const onSessionExpired = context?.onSessionExpired;
  const resolvedBaseUrl = baseUrl || context?.baseUrl || 'https://api.devic.ai';
  const client = useMemo(() => resolvedApiKey || getTenantSession
    ? new DevicApiClient({ apiKey: resolvedApiKey, baseUrl: resolvedBaseUrl, getTenantSession, onSessionExpired })
    : null, [resolvedApiKey, resolvedBaseUrl, getTenantSession, onSessionExpired]);
  const info = useAssistantInfo({ assistantId, client, baseUrl: resolvedBaseUrl, credential: resolvedApiKey || 'session', enabled: !!client });
  const available = info.assistant?.liveVoice?.enabled === true;

  // The same context the drawer sends with a call: provider values, this
  // bubble's own on top. Compared by value inside the hook, so a fresh object
  // per render costs nothing.
  const resolvedTags = Array.from(new Set([...(context?.tags ?? []), ...(tags ?? [])]));
  const subtenant = { ...context?.subtenantMetadata, ...subtenantMetadata };
  const voiceContext: LiveVoiceContext = {
    tenantId: tenantId || context?.tenantId, subtenantId: subtenantId || context?.subtenantId,
    metadata: { ...context?.tenantMetadata, ...tenantMetadata, ...(Object.keys(subtenant).length ? { subtenantMetadata: subtenant } : {}) },
    ...(resolvedTags.length ? { tags: resolvedTags } : {}), ...(enabledTools ? { enabledTools } : {}), ...(disabledIntegrations ? { disabledIntegrations } : {}),
  };

  const [chatUid, setChatUid] = useState<string | undefined>();
  const [expanded, setExpanded] = useState(false);
  const [ended, setEnded] = useState<LiveVoiceCallSummary | null>(null);
  const voice = useDevicLiveVoice({
    client, assistantId, chatUid, enabled: available, context: voiceContext,
    onChatCreated: uid => { setChatUid(uid); latest.current.onChatCreated?.(uid); },
    onError: error => latest.current.onError?.(error),
  });

  // A call that was running and is not any more has ended, however it did.
  const wasActive = useRef(false);
  useEffect(() => {
    if (voice.active) { wasActive.current = true; return; }
    if (!wasActive.current) return;
    wasActive.current = false;
    const summary: LiveVoiceCallSummary = { chatUid: voice.chatUid, seconds: voice.seconds, endReason: voice.endReason, transcript: voice.transcript };
    setEnded(summary);
    latest.current.onCallEnd?.(summary);
  }, [voice.active, voice.chatUid, voice.seconds, voice.endReason, voice.transcript]);

  const start = useCallback(async () => {
    if (latest.current.disabled) return;
    setEnded(null); setExpanded(true);
    latest.current.onCallStart?.();
    await voice.start();
  }, [voice.start]);
  const close = useCallback(() => {
    const summary = ended;
    setExpanded(false); setEnded(null);
    // The next call is a new conversation; the one that just ended can be
    // picked up in the chat.
    setChatUid(undefined);
    if (summary) latest.current.onClose?.(summary);
  }, [ended]);
  const openInChat = onOpenInChat ?? (context?.hasDrawer ? context.openDrawer : undefined);
  const continueInChat = useCallback(() => {
    const uid = ended?.chatUid;
    if (!uid || !openInChat) return;
    openInChat(uid); close();
  }, [ended, openInChat, close]);
  useImperativeHandle(ref, () => ({
    start, stop: voice.stop, expand: () => setExpanded(true), collapse: () => setExpanded(false),
  }), [start, voice.stop]);

  if (!client || !info.settled || !available) return null;

  const name = title || info.assistant?.name || assistantId;
  const face = avatarUrl ?? info.assistant?.imgUrl ?? avatarUri(info.assistant?.identifier || assistantId, info.assistant?.avatarStyle);
  const idleIn = voice.idleEndsAt && voice.state === 'connected' ? Math.max(0, Math.ceil((voice.idleEndsAt - Date.now()) / 1000)) : undefined;
  const status = voice.state === 'connecting' ? t('Calling…')
    : voice.state === 'connected' ? (idleIn !== undefined ? t('Still there? The call ends in {seconds} s', { seconds: idleIn }) : t('Live · {time}', { time: formatSeconds(voice.seconds) }))
    : voice.state === 'reconnecting' ? t('Restoring voice…') : voice.state === 'closing' ? t('Closing voice…')
    : ended ? (voice.error ? t('Call failed') : t('Call ended · {time}', { time: formatSeconds(ended.seconds) })) : t('Ready to call');
  const showPanel = expanded && (voice.active || !!ended || !!voice.error);
  const bubbleLabel = label || t('Call {name}', { name });
  const onBubble = () => { if (voice.active || ended || voice.error) setExpanded(value => !value); else void start(); };

  const rootStyle: React.CSSProperties = {
    ...themeVars(theme), zIndex,
    ['--devic-bubble-size' as string]: `${size}px`, ['--devic-bubble-offset' as string]: css(offset), ...style,
  };
  return <DevicTranslationsProvider translations={translations}>
    <div className={`devic-voice-bubble${className ? ` ${className}` : ''}`} style={rootStyle}
      data-placement={placement} data-side={side} data-panel-side={panelSide} data-voice-state={voice.state} data-dark={isDarkTheme(theme) ? 'true' : undefined}>
      {showPanel && <section className="devic-voice-bubble-panel" aria-label={t('Voice call')} data-voice-idle={idleIn !== undefined ? 'true' : undefined}>
        <header className="devic-voice-bubble-header">
          <img className="devic-voice-bubble-avatar" src={face} alt="" />
          <div className="devic-voice-bubble-heading">
            <div className="devic-voice-bubble-name">{name}</div>
            <span className="devic-voice-status" role="status"><i className="devic-voice-status-dot" aria-hidden="true" />{status}</span>
          </div>
          <button type="button" className="devic-voice-bubble-collapse" onClick={() => setExpanded(false)} title={t('Hide call')} aria-label={t('Hide call')}><ChevronIcon /></button>
        </header>
        {(voice.active || voice.transcript.length > 0) && <LiveVoicePrompter voice={voice} maxTurns={6} />}
        {voice.error && <div className="devic-voice-error" role="alert">{t(voice.error.message)}</div>}
        {!voice.error && ended?.endReason === 'idle' && <div className="devic-voice-note" role="status">{t('The call ended after a while without anyone speaking.')}</div>}
        {voice.playbackBlocked && voice.active && <button type="button" className="devic-voice-text-btn devic-voice-bubble-inline-btn" onClick={() => void voice.play()}>{t('Enable audio')}</button>}
        {idleIn !== undefined && <button type="button" className="devic-voice-text-btn devic-voice-still-here devic-voice-bubble-inline-btn" onClick={() => voice.stillHere()}>{t("I'm here")}</button>}
        <div className="devic-voice-bubble-controls">
          {voice.active ? <>
            <button type="button" className="devic-voice-bubble-round devic-voice-mute" aria-pressed={voice.muted} disabled={voice.state !== 'connected'}
              title={voice.muted ? t('Unmute') : t('Mute')} aria-label={voice.muted ? t('Unmute') : t('Mute')} onClick={() => voice.mute(!voice.muted)}>
              {voice.muted ? <MicOffIcon /> : <MicIcon />}
            </button>
            <button type="button" className="devic-voice-bubble-round devic-voice-bubble-hangup" disabled={voice.state === 'closing'}
              title={t('End call')} aria-label={t('End call')} onClick={() => void voice.stop()}><HangUpIcon /></button>
            <span className="devic-voice-bubble-round devic-voice-bubble-spacer" aria-hidden="true" />
          </> : <>
            {voice.error && <button type="button" className="devic-voice-bubble-round devic-voice-bubble-call" title={t('Call again')} aria-label={t('Call again')} onClick={() => void start()}><PhoneIcon /></button>}
            {ended?.chatUid && openInChat && <button type="button" className="devic-voice-bubble-action devic-voice-bubble-action--primary" onClick={continueInChat}><ChatIcon />{t('Open in chat')}</button>}
            <button type="button" className="devic-voice-bubble-action" onClick={close}>{t('Close')}</button>
          </>}
        </div>
      </section>}
      <div className="devic-voice-bubble-dock">
        {voice.active && !showPanel && <span className="devic-voice-bubble-chip" role="status"><i className="devic-voice-status-dot" aria-hidden="true" />{voice.state === 'connected' ? formatSeconds(voice.seconds) : status}</span>}
        <button type="button" className="devic-voice-bubble-btn" onClick={onBubble} disabled={disabled && !voice.active && !ended && !voice.error}
          aria-expanded={showPanel} title={bubbleLabel} aria-label={bubbleLabel}>
          {icon ?? (voice.active ? <WaveIcon /> : <PhoneIcon />)}
        </button>
      </div>
    </div>
  </DevicTranslationsProvider>;
});

function PhoneIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.58.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02L6.6 10.8z" />
  </svg>;
}
function HangUpIcon() {
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
  </svg>;
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
/** Five bars, the same figure the composer uses for voice mode; animated while a call runs. */
function WaveIcon() {
  return <svg className="devic-voice-bubble-wave" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="3" y="9" width="2.4" height="6" rx="1.2" /><rect x="7.3" y="5" width="2.4" height="14" rx="1.2" /><rect x="10.8" y="2" width="2.4" height="20" rx="1.2" /><rect x="14.3" y="6" width="2.4" height="12" rx="1.2" /><rect x="18.6" y="9" width="2.4" height="6" rx="1.2" />
  </svg>;
}
function ChatIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>;
}
function ChevronIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>;
}

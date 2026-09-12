import type { DevicApiClient } from '../api/client';
import type { LiveVoiceContext, LiveVoiceTurn } from '../api/liveVoice.types';

export type LiveVoiceState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closing' | 'error';
export interface LiveVoiceSnapshot {
  state: LiveVoiceState;
  chatUid?: string;
  sessionId?: string;
  muted: boolean;
  seconds: number;
  transcript: LiveVoiceTurn[];
  input?: MediaStream;
  output?: MediaStream;
  error?: Error;
  playbackBlocked?: boolean;
}
export const initialVoiceSnapshot = (): LiveVoiceSnapshot => ({ state: 'idle', muted: false, seconds: 0, transcript: [] });

/** No browser globals at import/constructor time; loaded only by start(). */
export class LiveVoiceController {
  private snapshot = initialVoiceSnapshot();
  private generation = 0;
  private attempts = 0;
  private disposeTransport: () => void = () => {};
  private audio?: HTMLAudioElement;
  private closing?: Promise<void>;
  private disposed = false;
  constructor(private client: DevicApiClient, private assistantId: string,
    private context: LiveVoiceContext, private changed: (value: LiveVoiceSnapshot) => void,
    private created: (chatUid: string) => void) {}

  private update(patch: Partial<LiveVoiceSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    if (!this.disposed) this.changed(this.snapshot);
  }
  mute(muted: boolean) {
    this.snapshot.input?.getAudioTracks().forEach(track => { track.enabled = !muted && this.snapshot.state === 'connected'; });
    this.update({ muted });
  }
  async play() {
    try { await this.audio?.play(); this.update({ playbackBlocked: false }); }
    catch { this.update({ playbackBlocked: true }); }
  }
  async start(chatUid?: string, recovering = false): Promise<void> {
    if (this.disposed || this.closing || (!recovering && !['idle', 'error'].includes(this.snapshot.state))) return;
    const generation = ++this.generation;
    const current = () => generation === this.generation && !this.disposed;
    if (!recovering) this.attempts = 0;
    this.update({ state: 'connecting', error: undefined, chatUid, sessionId: undefined,
      seconds: 0, ...(recovering ? {} : { transcript: [], muted: false }) });
    let media: MediaStream | undefined;
    let peer: RTCPeerConnection | undefined;
    let channel: RTCDataChannel | undefined;
    let audio: HTMLAudioElement | undefined;
    let health: ReturnType<typeof setInterval> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let connectDeadline: ReturnType<typeof setTimeout> | undefined;
    let backendReady = false;
    let lastTranscript = 0;
    let sessionId: string | undefined;
    let connectionLostAt = 0;
    let healthFailures = 0;
    const cleanup = () => {
      clearInterval(health); clearTimeout(deadline); clearTimeout(connectDeadline);
      media?.getTracks().forEach(track => track.stop());
      if (channel) { channel.onclose = null; channel.onmessage = null; channel.close(); }
      if (peer) { peer.onconnectionstatechange = null; peer.ontrack = null; peer.close(); }
      if (audio) { audio.pause(); audio.srcObject = null; }
      this.audio = undefined;
      this.update({ input: undefined, output: undefined });
    };
    this.disposeTransport = cleanup;
    const ready = () => {
      if (!current() || !backendReady || peer?.connectionState !== 'connected') return;
      clearTimeout(connectDeadline);
      media?.getAudioTracks().forEach(track => { track.enabled = !this.snapshot.muted; });
      this.update({ state: 'connected' });
    };
    const recover = async () => {
      if (!current()) return;
      ++this.generation;
      const ticket = this.generation;
      cleanup();
      this.update({ state: 'reconnecting' });
      try {
        if (!sessionId || ++this.attempts > 3) throw new Error('Voice connection interrupted. Please start again.');
        await this.client.closeLiveSession(this.assistantId, sessionId);
        // Never open another paid transport before the old one is confirmed closed.
        for (let i = 0; i < 35 && ticket === this.generation && !this.disposed; i++) {
          const state = await this.client.getLiveSessionStatus(this.assistantId, sessionId);
          if (state.status === 'closed') {
            if (ticket === this.generation && !this.disposed) await this.start(this.snapshot.chatUid, true);
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        if (ticket === this.generation) throw new Error('Could not confirm the previous voice session closed.');
      } catch (error) {
        if (ticket === this.generation) this.update({ state: 'error', error: error as Error });
      }
    };
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined')
        throw new Error('Voice requires microphone access on HTTPS or localhost.');
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true }, video: false });
      if (!current()) { media.getTracks().forEach(track => track.stop()); return; }
      media.getAudioTracks().forEach(track => { track.enabled = false; });
      this.update({ input: media });
      peer = new RTCPeerConnection({ bundlePolicy: 'max-bundle' });
      audio = new Audio(); this.audio = audio; audio.autoplay = true;
      peer.ontrack = event => {
        if (!current()) return;
        const output = new MediaStream([event.track]);
        audio!.srcObject = output;
        this.update({ output }); void this.play();
      };
      peer.onconnectionstatechange = () => {
        ready();
        if (peer?.connectionState === 'disconnected') connectionLostAt ||= Date.now();
        else connectionLostAt = 0;
        if (peer?.connectionState === 'failed') void recover();
      };
      media.getTracks().forEach(track => peer!.addTrack(track, media!));
      channel = peer.createDataChannel('oai-events');
      channel.onmessage = message => {
        if (!current()) return;
        try {
          const event = JSON.parse(message.data);
          if (event.type === 'session.started') { backendReady = true; ready(); }
          if (['session.input_transcript.delta', 'session.output_transcript.delta'].includes(event.type) && typeof event.delta === 'string') {
            lastTranscript = Date.now();
            const role = event.type === 'session.input_transcript.delta' ? 'user' : 'assistant';
            const turns = this.snapshot.transcript.slice(-3).map(turn => ({ ...turn }));
            if (turns[turns.length - 1]?.role === role) turns[turns.length - 1].text = (turns[turns.length - 1].text + event.delta).slice(-2000);
            else turns.push({ role, text: event.delta.slice(-2000) });
            this.update({ transcript: turns });
          }
          if (event.type === 'session.closed' && sessionId) {
            void this.client.getLiveSessionStatus(this.assistantId, sessionId).then(state => {
              if (!current()) return;
              if (state.restartRequested) void recover(); else void this.stop();
            }).catch(() => { if (current()) void this.stop(); });
          }
          if (event.type === 'error') { this.update({ error: new Error('Voice session failed.') }); void this.stop(); }
        } catch { /* Only lifecycle and spoken transcript events are accepted. */ }
      };
      channel.onclose = () => { if (current()) void recover(); };
      connectDeadline = setTimeout(() => {
        if (current()) { this.update({ error: new Error('Voice connection timed out.') }); void this.stop(); }
      }, 30000);
      await peer.setLocalDescription(await peer.createOffer());
      await new Promise<void>((resolve, reject) => {
        if (peer!.iceGatheringState === 'complete') return resolve();
        const done = () => {
          if (peer!.iceGatheringState !== 'complete') return;
          clearTimeout(timer); peer!.removeEventListener('icegatheringstatechange', done); resolve();
        };
        const timer = setTimeout(() => { peer!.removeEventListener('icegatheringstatechange', done); reject(new Error('Could not prepare the audio connection.')); }, 10000);
        peer!.addEventListener('icegatheringstatechange', done);
      });
      if (!current()) return;
      const result = await this.client.createLiveSession(this.assistantId, { ...this.context, chatUid, sdp: peer.localDescription!.sdp });
      sessionId = result.sessionId;
      if (!current()) { void this.client.closeLiveSession(this.assistantId, sessionId).catch(() => {}); return; }
      this.update({ sessionId, chatUid: result.chatUid }); this.created(result.chatUid);
      deadline = setTimeout(() => { void this.stop(); }, Math.max(1, Math.min(6000, result.maxDurationSeconds || 6000)) * 1000);
      await peer.setRemoteDescription({ type: 'answer', sdp: result.sdp });
      let busy = false;
      health = setInterval(async () => {
        if (!current() || busy) return;
        busy = true;
        try {
          const state = await this.client.getLiveSessionStatus(this.assistantId, sessionId!);
          if (!current()) return;
          healthFailures = 0;
          this.update({ seconds: state.seconds });
          if (state.interrupted || state.restartRequested || (connectionLostAt && Date.now() - connectionLostAt > 5000)) { void recover(); return; }
          if (state.status === 'closed') { void this.stop(); return; }
          backendReady = state.connected; ready();
          if (Date.now() - lastTranscript > 1500 && state.transcript?.length)
            this.update({ transcript: state.transcript.slice(-4).filter(t => t.role === 'user' || t.role === 'assistant').map(t => ({ role: t.role, text: t.text.slice(-2000) })) });
        } catch {
          if (current() && ++healthFailures >= 5) { this.update({ error: new Error('Voice status unavailable. Session stopped.')} ); void this.stop(); }
        } finally { busy = false; }
      }, 1000);
    } catch (error) {
      if (!current()) return;
      this.update({ error: error instanceof Error ? error : new Error(String(error)) });
      await this.stop();
    }
  }
  stop(): Promise<void> {
    if (this.closing) return this.closing;
    ++this.generation;
    this.disposeTransport();
    const id = this.snapshot.sessionId;
    this.update({ state: id ? 'closing' : (this.snapshot.error ? 'error' : 'idle') });
    this.closing = (async () => {
      if (id) {
        try { await this.client.closeLiveSession(this.assistantId, id); }
        catch (error) { this.update({ error: error as Error }); }
      }
      this.update({ state: this.snapshot.error ? 'error' : 'idle', sessionId: undefined });
    })().finally(() => { this.closing = undefined; });
    return this.closing;
  }
  dispose() { this.disposed = true; void this.stop(); }
}

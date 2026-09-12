const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/loadTs.cjs');
const { fakeVoice } = require('./helpers/fakeVoice.cjs');
const { LiveVoiceController } = loadTs(require('node:path').join(__dirname, '../src/voice/LiveVoiceController.ts'));
const { DevicApiClient } = loadTs(require('node:path').join(__dirname, '../src/api/client.ts'));

function client() {
  return { creates: [], closes: [], async createLiveSession(id, body) { this.creates.push(body); return { sessionId: 's1', chatUid: 'c1', sdp: 'answer', maxDurationSeconds: 60 }; },
    async closeLiveSession(id, session) { this.closes.push(session); }, async getLiveSessionStatus() { return { status: 'active', connected: true, seconds: 2 }; } };
}
test('SSR construction does not access media; permission denial creates no session', async () => {
  const media = fakeVoice(); const api = client(); let state;
  media.navigator.mediaDevices.getUserMedia = async () => { throw new Error('Permission denied'); };
  const voice = new LiveVoiceController(api, 'a', {}, s => { state = s; }, () => {});
  try { await voice.start(); assert.equal(api.creates.length, 0); assert.equal(state.state, 'error'); assert.match(state.error.message, /Permission/); }
  finally { voice.dispose(); media.restore(); }
});
test('immediate voice creates a chat with context, enables mic only when ready, handles mute and stop', async () => {
  const media = fakeVoice(); const api = client(); let state; const created = [];
  const voice = new LiveVoiceController(api, 'a', { tags: ['voice'], enabledTools: [] }, s => { state = s; }, id => created.push(id));
  try {
    await voice.start(); await voice.start();
    assert.equal(api.creates.length, 1); assert.deepEqual(api.creates[0].enabledTools, []); assert.deepEqual(created, ['c1']);
    assert.equal(state.state, 'connected'); assert.equal(media.tracks[0].enabled, true);
    voice.mute(true); assert.equal(media.tracks[0].enabled, false);
    media.peers[0].event({ type: 'session.input_transcript.delta', delta: 'Hello' });
    media.peers[0].event({ type: 'session.output_transcript.delta', delta: 'Hi' });
    media.peers[0].event({ type: 'response.reasoning.delta', delta: 'PRIVATE' });
    assert.deepEqual(state.transcript, [{ role: 'user', text: 'Hello' }, { role: 'assistant', text: 'Hi' }]);
    await voice.stop(); assert.equal(media.tracks[0].stopped, true); assert.equal(media.peers[0].closed, true); assert.deepEqual(api.closes, ['s1']);
  } finally { voice.dispose(); media.restore(); }
});
test('cancel during mic permission and late session creation releases resources without adopting a chat', async () => {
  const media = fakeVoice(); const api = client(); let resolve; let created = 0;
  const pending = new Promise(r => { resolve = r; }); api.createLiveSession = () => pending;
  const voice = new LiveVoiceController(api, 'a', {}, () => {}, () => created++);
  try {
    const starting = voice.start(); await new Promise(r => setImmediate(r)); await voice.stop();
    resolve({ sessionId: 'late', chatUid: 'late-chat', sdp: 'answer', maxDurationSeconds: 60 }); await starting;
    assert.equal(created, 0); assert.deepEqual(api.closes, ['late']); assert.ok(media.tracks.every(t => t.stopped));
  } finally { voice.dispose(); media.restore(); }
});
test('live API methods reuse tenant renewal and authenticated binary downloads', async () => {
  const original = global.fetch; const requests = []; let renewals = 0;
  const api = new DevicApiClient({ baseUrl: 'http://api.test', getTenantSession: async () => (++renewals === 1 ? 'expired-test' : 'fresh-test') });
  global.fetch = async (url, init) => {
    requests.push({ url, init });
    if (init.headers.Authorization.endsWith('expired-test')) return new Response('{}', { status: 401 });
    if (url.endsWith('/audio')) return new Response(Uint8Array.of(82, 73, 70, 70), { headers: { 'Content-Type': 'audio/wav' } });
    return new Response(JSON.stringify({ data: { sessionId: 's', chatUid: 'c' } }));
  };
  try {
    await api.createLiveSession('a/b', { sdp: 'v=0', tools: [], tags: ['voice'] });
    const blob = await api.getLiveRecordingAudio('a/b', 'c/d', 's/e');
    assert.equal(renewals, 2); assert.equal(blob.size, 4); assert.equal(blob.type, 'audio/wav');
    assert.ok(requests[2].url.includes('a%2Fb/chats/c%2Fd/recordings/s%2Fe/audio'));
    assert.equal(requests[2].init.headers.Authorization, 'Bearer fresh-test');
  } finally { global.fetch = original; }
});
test('recovery closes the old session before creating another and preserves the chat without replaying speech', async () => {
  const media = fakeVoice(); const api = client(); const order = []; let state;
  api.createLiveSession = async (id, body) => { order.push(['create', body.chatUid]); return { sessionId: `s${order.length}`, chatUid: 'existing', sdp: 'answer', maxDurationSeconds: 60 }; };
  api.closeLiveSession = async () => { order.push(['close']); };
  api.getLiveSessionStatus = async () => { order.push(['status']); return { status: 'closed' }; };
  const voice = new LiveVoiceController(api, 'a', {}, value => { state = value; }, () => {});
  try {
    await voice.start('existing'); media.peers[0].connectionState = 'failed'; media.peers[0].onconnectionstatechange();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(order, [['create', 'existing'], ['close'], ['status'], ['create', 'existing']]);
    assert.equal(state.state, 'connected'); assert.equal(media.tracks[0].stopped, true);
  } finally { await voice.stop(); media.restore(); }
});
test('cancel while microphone permission is pending stops the late track without a paid session', async () => {
  const media = fakeVoice(); const api = client(); let grant;
  media.navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { grant = resolve; });
  const voice = new LiveVoiceController(api, 'a', {}, () => {}, () => {});
  const track = { stopped: false, stop() { this.stopped = true; } };
  try {
    const pending = voice.start(); await voice.stop(); grant({ getTracks: () => [track] }); await pending;
    assert.equal(track.stopped, true); assert.equal(api.creates.length, 0);
  } finally { voice.dispose(); media.restore(); }
});

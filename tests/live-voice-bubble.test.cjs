const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { loadTs } = require('./helpers/loadTs.cjs');
const { fakeVoice } = require('./helpers/fakeVoice.cjs');
const path = require('node:path');
const { LiveVoiceBubble } = loadTs(path.join(__dirname, '../src/components/LiveVoiceBubble/LiveVoiceBubble.tsx'));
const { DevicProvider } = loadTs(path.join(__dirname, '../src/provider/DevicProvider.tsx'));
const { useDevicContext } = loadTs(path.join(__dirname, '../src/provider/DevicContext.ts'));
global.IS_REACT_ACT_ENVIRONMENT = true;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

/** The Devic API a bubble talks to, answered locally. */
function fakeApi({ voiceEnabled = true } = {}) {
  const requests = [];
  global.fetch = async (url, init = {}) => {
    const { pathname, search } = new URL(url); requests.push({ path: pathname + search, method: init.method || 'GET', body: init.body && JSON.parse(init.body) });
    if (pathname.endsWith('/live/sessions')) return json({ sessionId: 's1', chatUid: 'c1', sdp: 'answer', maxDurationSeconds: 600, idleTimeoutSeconds: 180 });
    if (pathname.endsWith('/live/sessions/s1')) return json({ sessionId: 's1', chatUid: 'c1', status: 'active', connected: true, seconds: 7 });
    return json({ identifier: 'desk', name: 'Order desk', liveVoice: { enabled: voiceEnabled } });
  };
  return requests;
}
/** A stand-in for a mounted ChatDrawer: registers itself on the provider. */
function FakeDrawer({ log }) {
  const context = useDevicContext();
  React.useEffect(() => context.registerDrawer({ open: () => log.push('open'), close() {}, setChatUid: uid => log.push(`load ${uid}`) }), [context]);
  return null;
}
const find = (renderer, label) => renderer.root.findAllByType('button').find(n => n.props['aria-label'] === label || n.children.some(c => c === label));
const text = renderer => JSON.stringify(renderer.toJSON());

test('the bubble calls on tap, tucks away while live, and hands the finished call to the drawer', async () => {
  const media = fakeVoice(); const originalFetch = global.fetch; const requests = fakeApi();
  const log = []; const ends = []; let renderer;
  try {
    await act(async () => {
      renderer = create(React.createElement(DevicProvider, { apiKey: 'k', baseUrl: 'http://api.test', tenantId: 'acme', tags: ['web'] },
        React.createElement(FakeDrawer, { log }),
        React.createElement(LiveVoiceBubble, { assistantId: 'desk', tags: ['bubble'], onCallEnd: s => ends.push(s), theme: { color: '#4661b1' } })));
      await sleep(20);
    });
    const bubble = find(renderer, 'Call Order desk');
    assert.ok(bubble, 'the bubble is named after the assistant');
    assert.equal(renderer.root.findAllByProps({ className: 'devic-voice-bubble-panel' }).length, 0, 'no panel before a call');
    const root = renderer.root.findByProps({ 'data-placement': 'floating' });
    assert.equal(root.props.style['--devic-primary'], '#4661b1', 'theme becomes inline variables');

    await act(async () => { bubble.props.onClick(); await sleep(30); });
    assert.equal(renderer.root.findAllByProps({ className: 'devic-voice-bubble-panel' }).length, 1, 'tapping opens the panel and calls');
    const session = requests.find(r => r.path.endsWith('/live/sessions'));
    assert.equal(session.body.tenantId, 'acme'); assert.deepEqual(session.body.tags, ['web', 'bubble']);
    assert.ok(text(renderer).includes('Live · '), 'connected: the header shows the elapsed time');
    assert.ok(find(renderer, 'End call')); assert.ok(find(renderer, 'Mute'));
    assert.equal(renderer.root.findAllByType('canvas').length, 2, 'one wave per speaker');
    await act(async () => { media.peers[0].event({ type: 'session.output_transcript.delta', delta: 'Hello there' }); await sleep(10); });
    assert.ok(text(renderer).includes('Hello there'));

    await act(async () => { find(renderer, 'Hide call').props.onClick(); });
    assert.equal(renderer.root.findAllByProps({ className: 'devic-voice-bubble-panel' }).length, 0, 'tucked away');
    assert.equal(renderer.root.findAllByProps({ className: 'devic-voice-bubble-chip' }).length, 1, 'the timer stays beside the bubble');
    await act(async () => { find(renderer, 'Call Order desk').props.onClick(); });
    assert.equal(renderer.root.findAllByProps({ className: 'devic-voice-bubble-panel' }).length, 1, 'tapping again brings it back');

    await act(async () => { find(renderer, 'End call').props.onClick(); await sleep(30); });
    assert.equal(ends.length, 1); assert.equal(ends[0].chatUid, 'c1'); assert.equal(ends[0].transcript[0].text, 'Hello there');
    assert.ok(text(renderer).includes('Call ended · '), 'the header says the call is over');
    assert.ok(find(renderer, 'Open in chat'), 'a registered drawer makes the offer');
    assert.ok(find(renderer, 'Close'));
    assert.equal(find(renderer, 'End call'), undefined);
    await act(async () => { find(renderer, 'Open in chat').props.onClick(); });
    assert.deepEqual(log, ['load c1', 'open'], 'the drawer loads the conversation, then opens');
    assert.equal(renderer.root.findAllByProps({ className: 'devic-voice-bubble-panel' }).length, 0, 'and the panel is gone');
    assert.ok(media.tracks[0].stopped, 'the microphone was released');
  } finally { await act(async () => renderer?.unmount()); media.restore(); global.fetch = originalFetch; }
});

test('without a drawer only Close is offered, and it starts the next call in a new conversation', async () => {
  const media = fakeVoice(); const originalFetch = global.fetch; const requests = fakeApi();
  const closed = []; let renderer; const ref = React.createRef();
  try {
    await act(async () => { renderer = create(React.createElement(LiveVoiceBubble, { ref, assistantId: 'desk', apiKey: 'k', baseUrl: 'http://api.test', placement: 'inline', onClose: s => closed.push(s) })); await sleep(20); });
    await act(async () => { await ref.current.start(); await sleep(30); });
    await act(async () => { await ref.current.stop(); await sleep(30); });
    assert.equal(find(renderer, 'Open in chat'), undefined, 'nowhere to open it');
    await act(async () => { find(renderer, 'Close').props.onClick(); await sleep(10); });
    assert.equal(closed.length, 1); assert.equal(closed[0].chatUid, 'c1');
    assert.equal(renderer.root.findAllByProps({ className: 'devic-voice-bubble-panel' }).length, 0);
    await act(async () => { await ref.current.start(); await sleep(30); });
    const sessions = requests.filter(r => r.path.endsWith('/live/sessions') && r.method === 'POST');
    assert.equal(sessions.length, 2); assert.equal(sessions[1].body.chatUid, undefined, 'a fresh conversation, not c1 again');
  } finally { await act(async () => renderer?.unmount()); media.restore(); global.fetch = originalFetch; }
});

test('a custom onOpenInChat replaces the drawer, and an assistant without voice renders nothing', async () => {
  const media = fakeVoice(); const originalFetch = global.fetch; fakeApi();
  const opened = []; let renderer; const ref = React.createRef();
  try {
    await act(async () => { renderer = create(React.createElement(LiveVoiceBubble, { ref, assistantId: 'desk', apiKey: 'k', baseUrl: 'http://api.test', onOpenInChat: uid => opened.push(uid) })); await sleep(20); });
    await act(async () => { await ref.current.start(); await sleep(30); });
    await act(async () => { await ref.current.stop(); await sleep(30); });
    await act(async () => { find(renderer, 'Open in chat').props.onClick(); });
    assert.deepEqual(opened, ['c1']);
    await act(async () => renderer.unmount());
    fakeApi({ voiceEnabled: false });
    await act(async () => { renderer = create(React.createElement(LiveVoiceBubble, { assistantId: 'quiet', apiKey: 'k', baseUrl: 'http://api.test' })); await sleep(20); });
    assert.equal(renderer.toJSON(), null, 'no bubble for an assistant whose voice is off');
  } finally { await act(async () => renderer?.unmount()); media.restore(); global.fetch = originalFetch; }
});

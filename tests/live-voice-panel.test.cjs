const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { loadTs } = require('./helpers/loadTs.cjs');
const Panel = loadTs(require('node:path').join(__dirname, '../src/components/ChatDrawer/LiveVoicePanel.tsx')).default;
global.IS_REACT_ACT_ENVIRONMENT = true;
test('voice panel is an invitation card, then takes the composer\'s place with prompter, waves and call controls', async () => {
  let starts = 0; let stops = 0; const mutes = [];
  const voice = { active: false, state: 'idle', muted: false, seconds: 0, transcript: [], start: async () => starts++, stop: async () => stops++, mute: value => mutes.push(value), play() {} };
  let renderer;
  const props = { voice, canStart: true };
  const button = label => renderer.root.findAllByType('button').find(n => n.children.some(c => c === label) || n.props['aria-label'] === label);
  const byClass = className => renderer.root.findAllByProps({ className });
  try {
    await act(async () => { renderer = create(React.createElement(Panel, props)); });
    assert.equal(byClass('devic-voice-card').length, 1, 'idle: the invitation card above the composer');
    assert.equal(byClass('devic-input-area devic-voice-area').length, 0);
    assert.ok(!JSON.stringify(renderer.toJSON()).includes('Included minutes'), 'no allowance tag on the card');
    await act(async () => { await button('Start voice').props.onClick(); }); assert.equal(starts, 1);

    const connecting = { ...voice, active: true, state: 'connecting' };
    await act(async () => { renderer.update(React.createElement(Panel, { ...props, voice: connecting })); });
    assert.equal(byClass('devic-input-area devic-voice-area').length, 1, 'active: the panel is the input area');
    assert.equal(byClass('devic-voice-card').length, 0, 'the idle card is gone');
    assert.ok(button('Cancel'), 'while connecting the only way out is Cancel');
    assert.equal(button('End voice'), undefined);
    assert.ok(JSON.stringify(renderer.toJSON()).includes('Connecting voice…'));

    const active = { ...voice, active: true, state: 'connected', seconds: 65, transcript: [{ role: 'user', text: 'Hi' }, { role: 'assistant', text: 'Hello' }] };
    const banner = React.createElement('em', { className: 'banner' }, 'limit');
    await act(async () => { renderer.update(React.createElement(Panel, { ...props, voice: active }, banner)); });
    assert.equal(byClass('devic-voice-prompter-viewport').length, 1);
    assert.equal(renderer.root.findAllByType('canvas').length, 2);
    assert.equal(byClass('devic-voice-turn devic-voice-turn--current').length, 1);
    assert.equal(byClass('banner').length, 1, 'the composer banners render above the call box');
    assert.ok(JSON.stringify(renderer.toJSON()).includes('Live · 1:05'), 'elapsed time as m:ss');
    const mute = button('Mute');
    assert.equal(mute.props['aria-pressed'], false);
    await act(async () => { mute.props.onClick(); }); assert.deepEqual(mutes, [true]);
    await act(async () => { renderer.update(React.createElement(Panel, { ...props, voice: { ...active, muted: true } })); });
    assert.equal(button('Unmute').props['aria-pressed'], true);
    assert.equal(button('Cancel'), undefined);
    await act(async () => { await button('End voice').props.onClick(); }); assert.equal(stops, 1);

    await act(async () => { renderer.update(React.createElement(Panel, { ...props, voice: { ...voice, state: 'error', error: new Error('Voice session failed.') } })); });
    assert.equal(byClass('devic-voice-card').length, 1, 'an error lands back on the idle card');
    assert.ok(JSON.stringify(renderer.toJSON()).includes('Voice session failed.'));
  } finally { await act(async () => renderer?.unmount()); }
});

test('the invitation can be closed, and a host can replace it with its own', async () => {
  let starts = 0; let dismissed = 0;
  const voice = { active: false, state: 'idle', muted: false, seconds: 0, transcript: [], start: async () => starts++, stop() {}, mute() {}, play() {} };
  let renderer;
  const button = label => renderer.root.findAllByType('button').find(n => n.children.some(c => c === label) || n.props['aria-label'] === label);
  try {
    await act(async () => { renderer = create(React.createElement(Panel, { voice, canStart: true, onDismiss: () => dismissed++ })); });
    await act(async () => { button('Hide voice mode').props.onClick(); }); assert.equal(dismissed, 1);

    let given;
    const invitation = props => { given = props; return React.createElement('button', { className: 'mine', onClick: props.start }, 'Call'); };
    await act(async () => { renderer.update(React.createElement(Panel, { voice, canStart: false, recordSessions: true, onDismiss: () => dismissed++, invitation })); });
    assert.equal(renderer.root.findAllByProps({ className: 'devic-voice-card' }).length, 0, 'the default card is replaced');
    assert.equal(given.canStart, false); assert.equal(given.recordSessions, true);
    await act(async () => { given.start(); }); assert.equal(starts, 0, 'start is a no-op while canStart is false');
    await act(async () => { given.dismiss(); }); assert.equal(dismissed, 2);
    await act(async () => { renderer.update(React.createElement(Panel, { voice, canStart: true, invitation })); });
    await act(async () => { given.start(); }); assert.equal(starts, 1);
  } finally { await act(async () => renderer?.unmount()); }
});

test('the closed invitation is remembered per assistant and survives a blocked storage', () => {
  const { isVoiceInvitationHidden, hideVoiceInvitation, showVoiceInvitation } = loadTs(require('node:path').join(__dirname, '../src/utils/voiceInvitation.ts'));
  const store = new Map();
  global.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  try {
    assert.equal(isVoiceInvitationHidden('a'), false);
    hideVoiceInvitation('a');
    assert.equal(isVoiceInvitationHidden('a'), true); assert.equal(isVoiceInvitationHidden('b'), false);
    showVoiceInvitation('a'); assert.equal(isVoiceInvitationHidden('a'), false);
    global.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    assert.equal(isVoiceInvitationHidden('a'), false); hideVoiceInvitation('a'); showVoiceInvitation('a');
  } finally { delete global.localStorage; }
});

test('prompter follows newest words, bounds turns, handles resize and cleans observers', async () => {
  const { LiveVoicePrompter } = loadTs(require('node:path').join(__dirname, '../src/components/ChatDrawer/LiveVoicePrompter.tsx'));
  const original = global.ResizeObserver;
  let resize, disconnected = 0;
  global.ResizeObserver = class { constructor(callback) { resize = callback; } observe() {} disconnect() { disconnected++; } };
  const viewport = { clientHeight: 84 };
  const text = { scrollHeight: 240, style: {} };
  let renderer;
  try {
    const voice = { state: 'connected', muted: true, transcript: Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `Turn ${i}` })) };
    await act(async () => { renderer = create(React.createElement(LiveVoicePrompter, { voice }), { createNodeMock: element => element.props.className === 'devic-voice-prompter-viewport' ? viewport : element.props.className === 'devic-voice-prompter-text' ? text : null }); });
    assert.equal(text.style.transform, 'translateY(-156px)');
    assert.equal(renderer.root.findAllByType('p').length, 4);
    text.scrollHeight = 300; resize(); assert.equal(text.style.transform, 'translateY(-216px)');
    await act(async () => renderer.update(React.createElement(LiveVoicePrompter, { voice: { ...voice, transcript: [], state: 'reconnecting' } })));
    assert.ok(JSON.stringify(renderer.toJSON()).includes('Restoring voice…'));
  } finally { await act(async () => renderer?.unmount()); global.ResizeObserver = original; }
  assert.equal(disconnected, 2);
});

test('wave level is RMS loudness clamped to 1, and silence is 0', () => {
  const { waveLevel } = loadTs(require('node:path').join(__dirname, '../src/components/ChatDrawer/LiveVoicePrompter.tsx'));
  assert.equal(waveLevel(new Uint8Array(256).fill(128)), 0);
  assert.equal(waveLevel(new Uint8Array(256).fill(255)), 1);
  const quiet = new Uint8Array(256).fill(128); quiet[0] = 160;
  assert.ok(waveLevel(quiet) > 0 && waveLevel(quiet) < 0.1, 'a single click does not spike the bar');
});

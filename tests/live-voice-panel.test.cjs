const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { loadTs } = require('./helpers/loadTs.cjs');
const Panel = loadTs(require('node:path').join(__dirname, '../src/components/ChatDrawer/LiveVoicePanel.tsx')).default;
global.IS_REACT_ACT_ENVIRONMENT = true;
test('voice panel keeps recording list and audio lazy, renders two bounded transcript lines and stop controls', async () => {
  let lists = 0; let downloads = 0; let starts = 0; let stops = 0;
  const voice = { active: false, state: 'idle', muted: false, seconds: 0, transcript: [], start: async () => starts++, stop: async () => stops++, mute() {}, play() {} };
  const client = { async getLiveRecordings() { lists++; return [{ sessionId: 's', status: 'ready', startedAt: 1 }]; }, async getLiveRecordingAudio() { downloads++; return new Blob(['RIFF']); } };
  let renderer;
  const props = { voice, client, assistantId: 'a', chatUid: 'c', canStart: true };
  const button = label => renderer.root.findAllByType('button').find(n => n.children.some(c => c === label));
  try {
    await act(async () => { renderer = create(React.createElement(Panel, props)); });
    assert.equal(lists, 0); assert.equal(downloads, 0);
    await act(async () => { await button('Voice recordings').props.onClick(); }); assert.equal(lists, 1); assert.equal(downloads, 0);
    await act(async () => { await button('Play recording').props.onClick(); }); assert.equal(downloads, 1);
    await act(async () => { await button('Start voice').props.onClick(); }); assert.equal(starts, 1);
    const active = { ...voice, active: true, state: 'connected', transcript: [{ role: 'user', text: 'Hi' }, { role: 'assistant', text: 'Hello' }] };
    await act(async () => { renderer.update(React.createElement(Panel, { ...props, voice: active })); });
    assert.equal(renderer.root.findAllByProps({ className: 'devic-voice-prompter' }).length, 2);
    assert.equal(renderer.root.findAllByType('audio').length, 0, 'recording playback stops before live audio');
    await act(async () => { await button('End voice').props.onClick(); }); assert.equal(stops, 1);
  } finally { await act(async () => renderer?.unmount()); }
});

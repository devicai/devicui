const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { loadTs } = require('./helpers/loadTs.cjs');
const { fakeVoice } = require('./helpers/fakeVoice.cjs');
const { useDevicChat } = loadTs(require('node:path').join(__dirname, '../src/hooks/useDevicChat.ts'));
global.IS_REACT_ACT_ENVIRONMENT = true;
const sleep = ms => new Promise(r => setTimeout(r, ms));
test('voice reuses one SSE across completed turns, renders partials and executes client tools once', async () => {
  const media = fakeVoice(); const original = global.fetch;
  const requests = []; let stream; let chat; let calls = 0; let created = 0; let received = 0;
  const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  const tools = [{ toolName: 'confirm', schema: { type: 'function', function: { name: 'confirm', description: 'Confirm', parameters: { type: 'object', properties: {} } } }, callback: async () => { calls++; return { ok: true }; } }];
  tools.push({ toolName: 'ask', schema: { type: 'function', function: { name: 'ask', description: 'Ask', parameters: { type: 'object', properties: {} } } }, responseWidget: { render: 'input', component: () => null } });
  global.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname; requests.push({ path, method: init.method, body: init.body && JSON.parse(init.body) });
    if (path.endsWith('/live/sessions')) return json({ sessionId: 's1', chatUid: 'c1', sdp: 'answer', maxDurationSeconds: 60 });
    if (path.endsWith('/live/sessions/s1')) return json({ status: 'active', connected: true, seconds: 1 });
    if (path.endsWith('/stream')) return new Response(new ReadableStream({ start(controller) { stream = controller; init.signal.addEventListener('abort', () => { try { controller.close(); } catch {} }); } }), { headers: { 'Content-Type': 'text/event-stream' } });
    if (path.endsWith('/tool-response')) return json({});
    return json({ identifier: 'a', messageQueueEnabled: false, liveVoice: { enabled: true } });
  };
  function Probe() { chat = useDevicChat({ assistantId: 'a', apiKey: 'test', baseUrl: 'http://api.test', liveVoice: { enabled: true }, modelInterfaceTools: tools,
    tenantId: 'tenant', subtenantId: 'person', tags: ['voice'], onChatCreated: () => created++, onMessageReceived: () => received++ }); return null; }
  let renderer;
  const emit = async (status, messages, extra = {}) => {
    await act(async () => { stream.enqueue(new TextEncoder().encode(`event: snapshot\ndata: ${JSON.stringify({ status, chatHistory: messages, ...extra })}\n\n`)); await sleep(15); });
  };
  const u = n => ({ uid: `u${n}`, role: 'user', content: { message: `question ${n}` } });
  const a = n => ({ uid: `a${n}`, role: 'assistant', content: { message: `answer ${n}` } });
  try {
    await act(async () => { renderer = create(React.createElement(Probe)); });
    await act(async () => { await chat.voice.start(); });
    assert.ok(stream); assert.equal(created, 1); assert.equal(chat.chatUid, 'c1');
    const payload = requests.find(r => r.path.endsWith('/live/sessions')).body;
    assert.deepEqual(payload.tools, tools.map(t => t.schema)); assert.equal(payload.subtenantId, 'person');
    await emit('completed', [u(1), a(1)]); assert.equal(chat.isLoading, false); assert.equal(chat.voice.active, true);
    await emit('completed', [u(1), a(1)]); assert.equal(received, 1);
    await emit('processing', [u(1), a(1), u(2)], { streamingMessage: a(2) }); assert.equal(chat.isLoading, true); assert.equal(chat.messages.at(-1).uid, 'a2');
    const pending = { id: 'call1', type: 'function', function: { name: 'confirm', arguments: '{}' } };
    await emit('waiting_for_tool_response', [u(1), a(1), u(2)], { pendingToolCalls: [pending] });
    await emit('waiting_for_tool_response', [u(1), a(1), u(2)], { pendingToolCalls: [pending] }); assert.equal(calls, 1);
    const widgetCall = { id: 'widget1', type: 'function', function: { name: 'ask', arguments: '{}' } };
    await emit('waiting_for_tool_response', [u(1), a(1), u(2)], { pendingToolCalls: [widgetCall] });
    await emit('waiting_for_tool_response', [u(1), a(1), u(2)], { pendingToolCalls: [widgetCall] });
    assert.equal(chat.pendingWidgetCalls.length, 1); assert.equal(chat.voice.active, true); assert.equal(chat.isLoading, false);
    await act(async () => { await chat.submitWidgetResponse('widget1', { approved: true }); await chat.submitWidgetResponse('widget1', { approved: true }); });
    assert.equal(requests.filter(r => r.path.endsWith('/tool-response')).length, 2, 'one callback response and one user-confirmed response');
    await emit('handed_off', [u(1), a(1), u(2)], { handedOffSubThreadId: 'thread1' }); assert.equal(chat.handedOff, true);
    await emit('completed', [u(1), a(1), u(2), a(2)]); assert.equal(chat.isLoading, false); assert.equal(chat.handedOff, false);
    assert.deepEqual(chat.messages.map(m => m.role), ['user', 'assistant', 'user', 'assistant']);
    assert.equal(requests.filter(r => r.path.endsWith('/stream')).length, 1);
    assert.equal(requests.filter(r => r.path.endsWith('/realtime')).length, 0);
    await act(async () => { await chat.voice.stop(); }); assert.equal(chat.voice.active, false);
  } finally { await act(async () => renderer?.unmount()); global.fetch = original; media.restore(); }
});

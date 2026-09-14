const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { loadTs } = require('./helpers/loadTs.cjs');
const { useDevicChat } = loadTs(require('node:path').join(__dirname, '../src/hooks/useDevicChat.ts'));
global.IS_REACT_ACT_ENVIRONMENT = true;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
for (const streaming of [true, false]) test(`text chat continues through consecutive MIT calls (${streaming ? 'SSE' : 'polling'})`, async () => {
  const original = global.fetch;
  let chat, renderer, stream;
  const executed = [], responses = [];
  let state = { status: 'processing', chatHistory: [] };
  const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  const tools = ['get_selection', 'search_tools', 'update_selection'].map(toolName => ({
    toolName, schema: { type: 'function', function: { name: toolName, description: toolName, parameters: { type: 'object', properties: {} } } },
    callback: async () => { executed.push(toolName); await sleep(10); return { success: true }; },
  }));
  global.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/messages')) return json({ chatUid: 'mit-chat' });
    if (path.endsWith('/realtime')) return json(state);
    if (path.endsWith('/stream')) return new Response(new ReadableStream({ start(controller) {
      stream = controller;
      init.signal.addEventListener('abort', () => { stream = null; try { controller.close(); } catch {} });
    } }), { headers: { 'Content-Type': 'text/event-stream' } });
    if (path.endsWith('/tool-response')) { responses.push(JSON.parse(init.body)); await sleep(10); return json({}); }
    return json({ identifier: 'assistant', messageQueueEnabled: false });
  };
  function Probe() { chat = useDevicChat({ assistantId: 'assistant', apiKey: 'test', baseUrl: 'http://api.test', messageQueue: false, streaming, pollingInterval: 250, modelInterfaceTools: tools }); return null; }
  const emit = async next => {
    state = next;
    await act(async () => {
      if (streaming) {
        assert.ok(stream, 'the stream must remain open after a tool response');
        stream.enqueue(new TextEncoder().encode(`event: snapshot\ndata: ${JSON.stringify(state)}\n\n`));
      }
      await sleep(streaming ? 60 : 300);
    });
  };
  try {
    await act(async () => { renderer = create(React.createElement(Probe)); });
    await act(async () => { await chat.sendMessage('Choose tools'); });
    for (let i = 0; i < tools.length; i++) {
      const pending = { id: `call-${i}`, function: { name: tools[i].toolName, arguments: '{}' } };
      const snapshot = { status: 'waiting_for_tool_response', chatHistory: [], pendingToolCalls: [pending] };
      await emit(snapshot);
      assert.equal(responses.length, i + 1);
      await emit(snapshot); // A stale snapshot must not replay the callback.
      assert.equal(responses.length, i + 1);
    }
    await emit({ status: 'completed', chatHistory: [{ uid: 'answer', role: 'assistant', content: { message: 'Selection updated' } }] });
    assert.deepEqual(executed, tools.map(t => t.toolName));
    assert.equal(chat.messages.find(m => m.uid === 'answer').content.message, 'Selection updated');
    assert.equal(chat.isLoading, false);
    assert.equal(chat.error, null);
  } finally { await act(async () => renderer?.unmount()); global.fetch = original; }
});

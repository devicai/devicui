const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { loadTs } = require('./helpers/loadTs.cjs');
const { useDevicChat } = loadTs(require('node:path').join(__dirname, '../src/hooks/useDevicChat.ts'));
global.IS_REACT_ACT_ENVIRONMENT = true;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// WebKit can hold the end of a streamed response until more bytes arrive: the
// `waiting_for_tool_response` frame that follows a client tool call may never
// show up on its own. The hook has to go and read the state.
async function run({ toolName, backendTool = false, halfFrame = false }) {
  const original = global.fetch;
  let chat, renderer, stream;
  const executed = [], responses = [], realtimeReads = [];
  const call = { id: 'call-1', type: 'function', function: { name: toolName, arguments: '{}' } };
  const history = [
    { uid: 'u1', role: 'user', content: { message: 'Start' } },
    { uid: 'a1', role: 'assistant', content: null, tool_calls: [call] },
  ];
  let state = { status: 'processing', chatHistory: [] };
  const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  const tools = [{
    toolName: 'get_context',
    schema: { type: 'function', function: { name: 'get_context', description: 'context', parameters: { type: 'object', properties: {} } } },
    callback: async () => { executed.push('get_context'); return { ok: true }; },
  }];
  global.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/messages')) return json({ chatUid: 'recheck-chat' });
    if (path.endsWith('/realtime')) { realtimeReads.push(Date.now()); return json(state); }
    if (path.endsWith('/stream')) return new Response(new ReadableStream({ start(controller) {
      stream = controller;
      init.signal.addEventListener('abort', () => { stream = null; try { controller.close(); } catch {} });
    } }), { headers: { 'Content-Type': 'text/event-stream' } });
    if (path.endsWith('/tool-response')) { responses.push(JSON.parse(init.body)); return json({}); }
    return json({ identifier: 'assistant', messageQueueEnabled: false });
  };
  function Probe() { chat = useDevicChat({ assistantId: 'assistant', apiKey: 'test', baseUrl: 'http://api.test', messageQueue: false, streaming: true, pollingInterval: 250, modelInterfaceTools: tools }); return null; }
  try {
    await act(async () => { renderer = create(React.createElement(Probe)); });
    await act(async () => { await chat.sendMessage('Start'); await sleep(50); });
    // The call arrives while processing; the frame that says the run now waits
    // for it is the one the browser holds back, so only the realtime read has it.
    state = { status: 'processing', chatHistory: history };
    await act(async () => {
      const frame = `event: snapshot\ndata: ${JSON.stringify(state)}\n\n`;
      // Held back before its end: the call itself never reaches the page.
      stream.enqueue(new TextEncoder().encode(halfFrame ? frame.slice(0, frame.length / 2) : frame));
      await sleep(30);
    });
    const readsBefore = realtimeReads.length;
    state = backendTool
      ? { status: 'processing', chatHistory: history }
      : { status: 'waiting_for_tool_response', chatHistory: history };
    await act(async () => { await sleep(600); });
    const readsAt600 = realtimeReads.length - readsBefore;
    await act(async () => { await sleep(700); });
    return { executed, responses, readsAt600, reads: realtimeReads.length - readsBefore };
  } finally { await act(async () => renderer?.unmount()); global.fetch = original; }
}

test('a quiet stream on a client tool call is followed by a realtime read that runs the tool', async () => {
  const result = await run({ toolName: 'get_context' });
  assert.equal(result.readsAt600, 0, 'no read while the stream may still deliver it');
  assert.equal(result.reads, 1, 'one read once the stream has been quiet for a second');
  assert.deepEqual(result.executed, ['get_context']);
  assert.equal(result.responses.length, 1);
  assert.equal(result.responses[0].responses[0].tool_call_id, 'call-1');
});

test('a call to a tool this client does not own triggers no read', async () => {
  const result = await run({ toolName: 'search_web', backendTool: true });
  assert.equal(result.reads, 0);
  assert.deepEqual(result.executed, []);
  assert.equal(result.responses.length, 0);
});

test('a frame left half-received is followed by a realtime read', async () => {
  const result = await run({ toolName: 'get_context', halfFrame: true });
  assert.equal(result.readsAt600, 0);
  assert.equal(result.reads, 1);
  assert.deepEqual(result.executed, ['get_context']);
  assert.equal(result.responses.length, 1);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { loadTs } = require('./helpers/loadTs.cjs');
const { useModelInterface, resolvePendingToolCalls } = loadTs(path.join(__dirname, '../src/hooks/useModelInterface.ts'));
const { useDevicChat } = loadTs(path.join(__dirname, '../src/hooks/useDevicChat.ts'));
global.IS_REACT_ACT_ENVIRONMENT = true;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const tool = (toolName, callback = async () => ({ ok: true })) => ({
  toolName,
  schema: { type: 'function', function: { name: toolName, description: toolName, parameters: { type: 'object', properties: {} } } },
  callback,
});
const call = (id, name) => ({ id, type: 'function', function: { name, arguments: '{}' } });
const assistant = (...toolCalls) => ({ uid: `a-${toolCalls[0].id}`, role: 'assistant', content: { message: null }, tool_calls: toolCalls });
const answer = id => ({ uid: `t-${id}`, role: 'tool', tool_call_id: id, content: { ok: true } });
const isClient = name => name === 'get_current_study';

test('while the run goes on, only calls to loaded tools are the client\'s', () => {
  const chatHistory = [assistant(call('c1', 'get_current_study'), call('b1', 'run_terminal_command'))];
  const pending = resolvePendingToolCalls({ status: 'processing', chatHistory }, isClient);
  assert.deepEqual(pending.map(c => c.id), ['c1']);
});

test('once the API waits for a tool response, a call to a tool that is not loaded is owed too', () => {
  const chatHistory = [
    assistant(call('old', 'go_to_study_step')),
    answer('old'),
    assistant(call('c1', 'get_current_study'), call('gone', 'go_to_study_step'), call('b1', 'run_terminal_command')),
    answer('b1'),
  ];
  const pending = resolvePendingToolCalls({ status: 'waiting_for_tool_response', chatHistory }, isClient);
  assert.deepEqual(pending.map(c => c.id), ['c1', 'gone']);
});

test('a backend tool answered asynchronously is never the client\'s', () => {
  const chatHistory = [assistant(call('async1', 'wait_for_webhook'), call('gone', 'go_to_study_step'))];
  const pending = resolvePendingToolCalls({
    status: 'waiting_for_tool_response',
    chatHistory,
    pendingAsyncToolCalls: [{ toolCallId: 'async1', toolName: 'wait_for_webhook', sentAt: 1, resolved: false }],
  }, isClient);
  assert.deepEqual(pending.map(c => c.id), ['gone']);
});

test('pendingToolCalls reported by the API are taken as they come', () => {
  const pendingToolCalls = [call('x', 'anything')];
  assert.equal(resolvePendingToolCalls({ status: 'processing', chatHistory: [], pendingToolCalls }, isClient), pendingToolCalls);
});

function renderInterface(initialTools, graceMs) {
  let result, renderer;
  let tools = initialTools;
  function Probe() { result = useModelInterface({ tools, unavailableToolGraceMs: graceMs }); return null; }
  return {
    mount: () => act(async () => { renderer = create(React.createElement(Probe)); }),
    setTools: next => act(async () => { tools = next; renderer.update(React.createElement(Probe)); }),
    get: () => result,
    unmount: () => act(async () => renderer?.unmount()),
  };
}

test('a call to a tool that never shows up is answered as unavailable after the grace', async () => {
  const executed = [];
  const probe = renderInterface([tool('get_current_study', async () => { executed.push('get_current_study'); return { open: true }; })], 120);
  try {
    await probe.mount();
    const started = Date.now();
    const { responses, toolSchemas } = await probe.get().handleToolCalls([call('c1', 'get_current_study'), call('gone', 'go_to_study_step')]);
    assert.ok(Date.now() - started >= 100, 'the missing tool is given time to appear');
    assert.deepEqual(executed, ['get_current_study']);
    assert.deepEqual(responses.map(r => r.tool_call_id), ['c1', 'gone']);
    assert.equal(responses[1].role, 'tool');
    assert.equal(responses[1].content.errorType, 'TOOL_UNAVAILABLE');
    assert.match(responses[1].content.error, /go_to_study_step/);
    assert.deepEqual(toolSchemas.map(s => s.function.name), ['get_current_study']);
  } finally { await probe.unmount(); }
});

test('a tool registered while its call waits is executed, and restated with the new tools', async () => {
  const executed = [];
  const probe = renderInterface([], 2_000);
  try {
    await probe.mount();
    const handling = probe.get().handleToolCalls([call('late', 'go_to_study_step')]);
    await sleep(300);
    await probe.setTools([tool('go_to_study_step', async () => { executed.push('go_to_study_step'); return { step: 'surfaces' }; })]);
    const { responses, toolSchemas } = await handling;
    assert.deepEqual(executed, ['go_to_study_step']);
    assert.deepEqual(responses, [{ tool_call_id: 'late', role: 'tool', content: { step: 'surfaces' } }]);
    assert.deepEqual(toolSchemas.map(s => s.function.name), ['go_to_study_step']);
  } finally { await probe.unmount(); }
});

test('a chat left waiting on a tool the screen no longer offers is unblocked (SSE)', async () => {
  const original = global.fetch;
  let chat, renderer, stream;
  const responses = [];
  const state = {
    chatUID: 'stuck-chat',
    status: 'waiting_for_tool_response',
    chatHistory: [
      { uid: 'u1', role: 'user', content: { message: 'Start a study' } },
      assistant(call('gone', 'go_to_study_step')),
    ],
  };
  const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  global.fetch = async (url, init = {}) => {
    const { pathname } = new URL(url);
    if (pathname.endsWith('/stream')) return new Response(new ReadableStream({ start(controller) {
      stream = controller;
      controller.enqueue(new TextEncoder().encode(`event: snapshot\ndata: ${JSON.stringify(state)}\n\n`));
      init.signal?.addEventListener('abort', () => { stream = null; try { controller.close(); } catch {} });
    } }), { headers: { 'Content-Type': 'text/event-stream' } });
    if (pathname.endsWith('/tool-response')) { responses.push(JSON.parse(init.body)); return json({ chatUid: 'stuck-chat' }); }
    if (pathname.endsWith('/realtime')) return json(state);
    if (pathname.endsWith('/stuck-chat')) return json({ chatUID: 'stuck-chat', chatContent: state.chatHistory });
    return json({ identifier: 'assistant', messageQueueEnabled: false });
  };
  // The screen that registered go_to_study_step is gone: only a global tool is left.
  const tools = [tool('navigate')];
  function Probe() { chat = useDevicChat({ assistantId: 'assistant', apiKey: 'test', baseUrl: 'http://api.test', chatUid: 'stuck-chat', messageQueue: false, streaming: true, pollingInterval: 250, modelInterfaceTools: tools }); return null; }
  try {
    await act(async () => { renderer = create(React.createElement(Probe)); });
    await act(async () => { await sleep(300); });
    assert.equal(responses.length, 0, 'nothing is answered before the grace runs out');
    await act(async () => { await sleep(5_200); });
    assert.equal(responses.length, 1);
    const [sent] = responses[0].responses;
    assert.equal(sent.tool_call_id, 'gone');
    assert.equal(sent.content.errorType, 'TOOL_UNAVAILABLE');
    assert.deepEqual(sent.tools.map(s => s.function.name), ['navigate']);
    // The same snapshot again must not answer twice.
    await act(async () => {
      stream?.enqueue(new TextEncoder().encode(`event: snapshot\ndata: ${JSON.stringify(state)}\n\n`));
      await sleep(100);
    });
    assert.equal(responses.length, 1);
    assert.equal(chat.error, null);
  } finally { await act(async () => renderer?.unmount()); global.fetch = original; }
});

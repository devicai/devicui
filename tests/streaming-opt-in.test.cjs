// Streaming is opt-in: without the flag no widget opens `/stream`, with it the
// conversation is followed over SSE and the poll steps back.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { loadTs } = require('./helpers/loadTs.cjs');

global.IS_REACT_ACT_ENVIRONMENT = true;
const src = (file) => path.join(__dirname, '../src', file);
const { resolveStreaming, DEFAULT_STREAMING } = loadTs(src('hooks/usePolling.ts'));
const { useDevicChat } = loadTs(src('hooks/useDevicChat.ts'));
const { DevicProvider } = loadTs(src('provider/DevicProvider.tsx'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const snapshot = (status, extra = {}) => ({ chatUID: 'chat-1', clientUID: 'client', chatHistory: [], status, ...extra });
const userTurn = { uid: 'u1', role: 'user', chatUid: 'chat-1', timestamp: 1, content: { message: 'hi' } };
const assistantReply = { uid: 'a1', role: 'assistant', chatUid: 'chat-1', timestamp: 2, content: { message: 'Hello back' } };
const finished = () => snapshot('completed', { chatHistory: [userTurn, assistantReply] });

/**
 * A Devic API in miniature: accepts a message, reports it in progress, then
 * done. `quietMs` is how long the stream stays open and silent between its
 * first snapshot and the last; `streamUnavailable` answers the stream route
 * like an older API would.
 */
function fakeApi({ quietMs = 20, streamUnavailable = false } = {}) {
  const requests = [];
  let polls = 0;
  const fetch = async (url, init = {}) => {
    const pathname = new URL(url).pathname;
    requests.push(`${init.method || 'GET'} ${pathname}${new URL(url).search}`);
    if (init.method === 'POST' && pathname.endsWith('/messages')) return json({ chatUid: 'chat-1' });
    if (pathname.endsWith('/realtime')) {
      polls += 1;
      return json(polls < 3 ? snapshot('processing') : finished());
    }
    if (pathname.endsWith('/stream')) {
      if (streamUnavailable) return json({ statusCode: 404, message: 'Cannot GET' });
      const frames = [
        `event: snapshot\ndata: ${JSON.stringify(snapshot('processing', { streamingMessage: { ...assistantReply, content: { message: 'Hel' } } }))}\n\n`,
        ': keep-alive\n\n',
        `event: partial\ndata: ${JSON.stringify({ streamingMessage: { ...assistantReply, content: { message: 'Hello ba' } } })}\n\n`,
        `event: delta\ndata: ${JSON.stringify({ append: 'ck' })}\n\n`,
        `event: snapshot\ndata: ${JSON.stringify(finished())}\n\n`,
      ];
      const body = new ReadableStream({
        async start(controller) {
          for (const frame of frames) { controller.enqueue(new TextEncoder().encode(frame)); await sleep(quietMs); }
          controller.close();
        },
      });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    return json({ identifier: 'asst', name: 'Assistant' });
  };
  return { fetch, requests, streamed: () => requests.filter((r) => r.includes('/stream')), polled: () => requests.filter((r) => r.endsWith('/realtime')), partialAsked: () => requests.some((r) => r.endsWith('/stream?partial=1')) };
}

/** Mounts the hook, sends one message and waits for the conversation to settle. */
async function converse(options, wrap = (node) => node, apiOptions = {}) {
  const api = fakeApi(apiOptions);
  global.fetch = api.fetch;
  let chat;
  function Probe() { chat = useDevicChat({ assistantId: 'asst', baseUrl: 'http://api.test', pollingInterval: 250, ...options }); return null; }
  let renderer;
  await act(async () => { renderer = create(wrap(React.createElement(Probe))); });
  await act(async () => { await chat.sendMessage('hi'); });
  const deadline = Date.now() + 5000;
  while (chat.isLoading && Date.now() < deadline) await act(async () => { await sleep(30); });
  await act(async () => { renderer.unmount(); });
  assert.equal(chat.isLoading, false, 'conversation settled');
  assert.equal(chat.messages.at(-1)?.content.message, 'Hello back');
  return api;
}

test('streaming is off unless somebody asks for it', () => {
  assert.equal(DEFAULT_STREAMING, false);
  assert.equal(resolveStreaming(undefined, undefined), false);
  assert.equal(resolveStreaming(undefined, true), true);
  assert.equal(resolveStreaming(false, true), false, 'the component prop wins over the provider');
  assert.equal(resolveStreaming(null, 'yes', true), true, 'non-booleans are ignored');
});

test('without the flag the hook only polls: /stream is never requested', async () => {
  const api = await converse({ apiKey: 'key' });
  assert.deepEqual(api.streamed(), []);
  assert.ok(api.polled().length >= 3, `polled ${api.polled().length} times`);
});

test('with streaming: true the conversation is followed over /stream and never polled', async () => {
  const api = await converse({ apiKey: 'key', streaming: true });
  assert.deepEqual(api.streamed(), ['GET /api/v1/assistants/asst/chats/chat-1/stream?partial=1']);
  assert.deepEqual(api.polled(), []);
});

test('a stream that stays open but quiet keeps the poll silent too', async () => {
  // Quiet for far longer than the 250 ms cadence: a model thinking before it
  // writes must not turn the widget back into a request loop.
  const api = await converse({ apiKey: 'key', streaming: true }, undefined, { quietMs: 700 });
  assert.equal(api.streamed().length, 1);
  assert.deepEqual(api.polled(), []);
});

test('an API without the stream route falls back to polling', async () => {
  const api = await converse({ apiKey: 'key', streaming: true }, undefined, { streamUnavailable: true });
  assert.equal(api.streamed().length, 1, 'tried once');
  assert.ok(api.polled().length >= 3, `then polled (${api.polled().length} times)`);
});

test('a dead stream is dropped after the silence limit and reopened', async () => {
  const { usePolling } = loadTs(src('hooks/usePolling.ts'));
  const fetchFn = async () => snapshot('processing');
  const attempts = [];
  const streamFn = (onSnapshot, signal) =>
    new Promise((resolve, reject) => {
      attempts.push(Date.now());
      if (attempts.length === 1) {
        // First connection: opens, then never says anything again.
        signal.addEventListener('abort', () => reject(new Error('aborted')));
        return;
      }
      onSnapshot(finished()).then(resolve);
    });
  let stopped = null;
  let hook;
  function Probe() {
    hook = usePolling('chat-1', fetchFn, { interval: 100, streamFn, streamSilenceMs: 250, onStop: (data) => { stopped = data; } });
    return null;
  }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Probe)); });
  const deadline = Date.now() + 3000;
  while (!stopped && Date.now() < deadline) await act(async () => { await sleep(30); });
  await act(async () => { renderer.unmount(); });
  assert.equal(attempts.length, 2, 'reconnected once');
  assert.ok(attempts[1] - attempts[0] >= 250, 'only after the silence limit');
  assert.equal(stopped?.status, 'completed');
  assert.equal(hook.isPolling, false);
});

test('the provider can opt every widget in, and a component can still refuse', async () => {
  const provider = (streaming) => (node) => React.createElement(DevicProvider, { apiKey: 'key', baseUrl: 'http://api.test', streaming }, node);
  const inherited = await converse({}, provider(true));
  assert.equal(inherited.streamed().length, 1);
  const refused = await converse({ streaming: false }, provider(true));
  assert.deepEqual(refused.streamed(), []);
});

test('the client asks the API for partial frames', async () => {
  const api = await converse({ apiKey: 'key', streaming: true });
  assert.equal(api.partialAsked(), true);
});

test('partial frames are merged into the last snapshot; one before any snapshot is ignored', async () => {
  const { consumeChatStream } = loadTs(src('utils/consumeChatStream.ts'));
  const frames = [
    `event: partial\ndata: ${JSON.stringify({ streamingMessage: { content: { message: 'lost' } } })}\n\n`,
    `event: snapshot\ndata: ${JSON.stringify(snapshot('processing', { streamingMessage: { content: { message: 'Hel' } } }))}\n\n`,
    `event: partial\ndata: ${JSON.stringify({ streamingMessage: { content: { message: 'Hello' } } })}\n\n`,
    `event: delta\ndata: ${JSON.stringify({ append: ' world' })}\n\n`,
    ': keep-alive\n\n',
    `event: partial\ndata: ${JSON.stringify({ streamingMessage: null })}\n\n`,
    `event: snapshot\ndata: ${JSON.stringify(finished())}\n\n`,
  ];
  const body = new ReadableStream({
    start(controller) { for (const frame of frames) controller.enqueue(new TextEncoder().encode(frame)); controller.close(); },
  });
  const seen = [];
  let activity = 0;
  await consumeChatStream(new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }), (s) => { seen.push(s); }, () => { activity += 1; });
  assert.deepEqual(seen.map((s) => [s.status, s.streamingMessage?.content.message ?? null]), [
    ['processing', 'Hel'],
    ['processing', 'Hello'],
    ['processing', 'Hello world'],
    ['processing', null],
    ['completed', null],
  ]);
  assert.deepEqual(seen[1].chatHistory, seen[0].chatHistory, 'the merged state keeps the snapshot fields');
  assert.equal(seen.at(-1).chatHistory.length, 2);
  assert.ok(activity >= 1);
});

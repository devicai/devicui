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

/** A Devic API in miniature: accepts a message, reports it in progress, then done. */
function fakeApi() {
  const requests = [];
  let polls = 0;
  const fetch = async (url, init = {}) => {
    const pathname = new URL(url).pathname;
    requests.push(`${init.method || 'GET'} ${pathname}`);
    if (init.method === 'POST' && pathname.endsWith('/messages')) return json({ chatUid: 'chat-1' });
    if (pathname.endsWith('/realtime')) {
      polls += 1;
      return json(polls < 3 ? snapshot('processing') : finished());
    }
    if (pathname.endsWith('/stream')) {
      const frames = [
        `event: snapshot\ndata: ${JSON.stringify(snapshot('processing', { streamingMessage: { ...assistantReply, content: { message: 'Hel' } } }))}\n\n`,
        `event: snapshot\ndata: ${JSON.stringify(finished())}\n\n`,
      ];
      const body = new ReadableStream({
        async start(controller) {
          for (const frame of frames) { controller.enqueue(new TextEncoder().encode(frame)); await sleep(20); }
          controller.close();
        },
      });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    return json({ identifier: 'asst', name: 'Assistant' });
  };
  return { fetch, requests, streamed: () => requests.filter((r) => r.endsWith('/stream')), polled: () => requests.filter((r) => r.endsWith('/realtime')) };
}

/** Mounts the hook, sends one message and waits for the conversation to settle. */
async function converse(options, wrap = (node) => node) {
  const api = fakeApi();
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

test('with streaming: true the conversation is followed over /stream', async () => {
  const api = await converse({ apiKey: 'key', streaming: true });
  assert.deepEqual(api.streamed(), ['GET /api/v1/assistants/asst/chats/chat-1/stream']);
  assert.ok(api.polled().length <= 1, `the poll stepped back (polled ${api.polled().length} times)`);
});

test('the provider can opt every widget in, and a component can still refuse', async () => {
  const provider = (streaming) => (node) => React.createElement(DevicProvider, { apiKey: 'key', baseUrl: 'http://api.test', streaming }, node);
  const inherited = await converse({}, provider(true));
  assert.equal(inherited.streamed().length, 1);
  const refused = await converse({ streaming: false }, provider(true));
  assert.deepEqual(refused.streamed(), []);
});

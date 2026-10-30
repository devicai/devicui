const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { loadTs } = require('./helpers/loadTs.cjs');

global.IS_REACT_ACT_ENVIRONMENT = true;
const src = (file) => path.join(__dirname, '../src', file);

test('the API client starts an early resume on the paused conversation', async () => {
  const { DevicApiClient } = loadTs(src('api/client.ts'));
  const requests = [];
  const original = global.fetch;
  global.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), method: init.method });
    return new Response(JSON.stringify({
      chatUid: 'chat-1',
      outcome: 'resume_started',
      resumedEarly: true,
      previousPausedUntil: 1234,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const client = new DevicApiClient({ apiKey: 'key', baseUrl: 'http://api.test' });
    const result = await client.resumePausedChat('assistant', 'chat-1');
    assert.equal(requests[0].method, 'POST');
    assert.equal(
      requests[0].url,
      'http://api.test/api/v1/assistants/assistant/chats/chat-1/resume',
    );
    assert.equal(result.resumedEarly, true);
  } finally {
    global.fetch = original;
  }
});

test('the default pause widget shows context and executes resumeNow', async () => {
  const { AssistantPauseWidget } = loadTs(
    src('components/ChatDrawer/AssistantPauseWidget.tsx'),
  );
  let resumes = 0;
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(AssistantPauseWidget, {
      pausedUntil: new Date('2026-09-18T12:10:25Z').getTime(),
      pausedReason: 'Waiting for a scheduled check',
      isResuming: false,
      resumeNow: async () => {
        resumes += 1;
        return {
          chatUid: 'chat-1', outcome: 'resume_started', resumedEarly: true,
          previousPausedUntil: 1,
        };
      },
    }));
  });

  const root = renderer.root;
  assert.match(JSON.stringify(renderer.toJSON()), /Waiting for a scheduled check/);
  const button = root.findByProps({ className: 'devic-assistant-pause-resume' });
  assert.equal(button.children.join(''), 'Resume now');
  await act(async () => { button.props.onClick(); });
  assert.equal(resumes, 1);
  await act(async () => renderer.unmount());
});

test('useDevicChat exposes pause details and restarts observation after resumeNow', async () => {
  const { useDevicChat } = loadTs(src('hooks/useDevicChat.ts'));
  const original = global.fetch;
  const pausedUntil = Date.now() + 60_000;
  let resumeRequests = 0;
  let realtimeState = {
    status: 'paused_for_resume',
    chatHistory: [],
    pausedUntil,
    pausedReason: 'Wait one minute',
  };
  const json = (body) => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  global.fetch = async (url, init = {}) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/resume')) {
      resumeRequests += 1;
      realtimeState = { status: 'processing', chatHistory: [] };
      return json({
        chatUid: 'chat-pause', outcome: 'resume_started', resumedEarly: true,
        previousPausedUntil: pausedUntil,
      });
    }
    if (pathname.endsWith('/realtime')) return json(realtimeState);
    if (pathname.endsWith('/chats/chat-pause')) {
      return json({ chatUID: 'chat-pause', chatContent: [] });
    }
    return json({ identifier: 'assistant', messageQueueEnabled: false });
  };

  let chat;
  let renderer;
  function Probe() {
    chat = useDevicChat({
      assistantId: 'assistant',
      chatUid: 'chat-pause',
      apiKey: 'key',
      baseUrl: 'http://api.test',
      pollingInterval: 10_000,
      messageQueue: false,
    });
    return null;
  }

  try {
    await act(async () => { renderer = create(React.createElement(Probe)); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    assert.equal(chat.status, 'paused_for_resume');
    assert.equal(chat.pausedUntil, pausedUntil);
    assert.equal(chat.pausedReason, 'Wait one minute');

    await act(async () => { await chat.resumeNow(); });
    assert.equal(resumeRequests, 1);
    assert.equal(chat.status, 'processing');
    assert.equal(chat.pausedUntil, null);
    assert.equal(chat.pausedReason, null);
    assert.equal(chat.isLoading, true);
  } finally {
    await act(async () => renderer?.unmount());
    global.fetch = original;
  }
});

test('an overdue pause is watched without flipping to busy, and survives an empty resume snapshot', async (t) => {
  const { useDevicChat } = loadTs(src('hooks/useDevicChat.ts'));
  const original = global.fetch;
  const pausedUntil = Date.now() - 1_000;
  const history = [
    { uid: 'u1', role: 'user', content: { message: 'hi' }, timestamp: 1 },
    { uid: 'a1', role: 'assistant', content: { message: 'pausing' }, timestamp: 2 },
  ];
  let realtimeState = { status: 'paused_for_resume', chatHistory: history, pausedUntil };
  let realtimeReads = 0;
  const json = (body) => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  global.fetch = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/realtime')) { realtimeReads += 1; return json(realtimeState); }
    if (pathname.endsWith('/chats/chat-overdue')) {
      return json({ chatUID: 'chat-overdue', chatContent: history });
    }
    return json({ identifier: 'assistant', messageQueueEnabled: false });
  };
  const flush = async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  };

  let chat;
  const busyWhilePaused = [];
  let renderer;
  function Probe() {
    chat = useDevicChat({
      assistantId: 'assistant',
      chatUid: 'chat-overdue',
      apiKey: 'key',
      baseUrl: 'http://api.test',
      pollingInterval: 1_000,
      messageQueue: false,
    });
    if (chat.status === 'paused_for_resume') busyWhilePaused.push(chat.isLoading);
    return null;
  }

  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  try {
    await act(async () => { renderer = create(React.createElement(Probe)); await flush(); });
    assert.equal(chat.status, 'paused_for_resume');
    assert.equal(chat.isLoading, false);
    const readsAfterLoad = realtimeReads;
    busyWhilePaused.length = 0;

    // The overdue watch fires and keeps checking while the scheduler is late.
    for (let i = 0; i < 6; i++) {
      await act(async () => { t.mock.timers.tick(10_000); await flush(); });
    }
    assert.ok(realtimeReads > readsAfterLoad + 3, 'kept watching the overdue pause');
    assert.equal(chat.status, 'paused_for_resume');
    assert.ok(!busyWhilePaused.includes(true), 'never shown busy while still paused');

    // The scheduler resumes; the realtime entry had expired, so it is empty.
    realtimeState = { status: 'processing', chatHistory: [] };
    await act(async () => { t.mock.timers.tick(1_000); await flush(); });
    assert.equal(chat.status, 'processing');
    assert.equal(chat.isLoading, true);
    assert.deepEqual(chat.messages.map((m) => m.uid), ['u1', 'a1']);
  } finally {
    await act(async () => renderer?.unmount());
    t.mock.timers.reset();
    global.fetch = original;
  }
});

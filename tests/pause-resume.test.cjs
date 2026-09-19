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

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { loadTs } = require('./helpers/loadTs.cjs');

global.IS_REACT_ACT_ENVIRONMENT = true;
const src = (file) => path.join(__dirname, '../src', file);

test('message limit notice translates its text and starts a new chat', async () => {
  const { MessageLimitNotice } = loadTs(src('components/ChatDrawer/MessageLimitNotice.tsx'));
  const { DevicTranslationsProvider } = loadTs(src('i18n/useTranslations.tsx'));
  let newChats = 0;
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(DevicTranslationsProvider, {
      translations: {
        'Message limit reached for this chat': 'Límite alcanzado',
        'This conversation has reached its message limit. Start a new chat to continue.': 'Abre otra conversación.',
        'Start a new chat': 'Nuevo chat',
      },
    }, React.createElement(MessageLimitNotice, { onNewChat: () => { newChats += 1; } })));
  });
  assert.match(JSON.stringify(renderer.toJSON()), /Límite alcanzado/);
  assert.match(JSON.stringify(renderer.toJSON()), /Abre otra conversación/);
  const button = renderer.root.findByType('button');
  assert.equal(button.children.join(''), 'Nuevo chat');
  await act(async () => button.props.onClick());
  assert.equal(newChats, 1);
  await act(async () => renderer.unmount());
});

test('a reopened limited conversation keeps its stop reason until a new chat', async () => {
  const { useDevicChat } = loadTs(src('hooks/useDevicChat.ts'));
  const originalFetch = global.fetch;
  let realtimeHasReason = false;
  const json = (body) => new Response(JSON.stringify(body), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
  global.fetch = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/chats/full-chat')) return json({
      chatUID: 'full-chat', chatContent: [],
      ...(!realtimeHasReason ? { stopReason: 'max_chat_messages_reached' } : {}),
    });
    if (pathname.endsWith('/realtime')) return json({
      chatUID: 'full-chat', status: 'completed', chatHistory: [],
      ...(realtimeHasReason ? { stopReason: 'max_chat_messages_reached' } : {}),
    });
    return json({ identifier: 'assistant', messageQueueEnabled: false });
  };

  let chat;
  let renderer;
  function Probe() {
    chat = useDevicChat({ assistantId: 'assistant', chatUid: 'full-chat', apiKey: 'key', baseUrl: 'http://api.test' });
    return null;
  }
  try {
    await act(async () => { renderer = create(React.createElement(Probe)); });
    assert.equal(chat.stopReason, 'max_chat_messages_reached');
    await act(async () => chat.clearChat());
    assert.equal(chat.stopReason, null);
    realtimeHasReason = true;
    await act(async () => chat.loadChat('full-chat'));
    assert.equal(chat.stopReason, 'max_chat_messages_reached');
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    global.fetch = originalFetch;
  }
});

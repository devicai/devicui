const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { loadTs } = require('./helpers/loadTs.cjs');
const {
  messagePreviewText,
  messageThumbnail,
  isPinnableMessage,
} = loadTs(path.join(__dirname, '../src/components/ChatDrawer/messageText.ts'));
const { PinnedMessagesBar, buildPinnedMessageViews } = loadTs(
  path.join(__dirname, '../src/components/ChatDrawer/PinnedMessagesBar.tsx')
);
const { ChatMessages } = loadTs(path.join(__dirname, '../src/components/ChatDrawer/ChatMessages.tsx'));
const { useDevicChat } = loadTs(path.join(__dirname, '../src/hooks/useDevicChat.ts'));
global.IS_REACT_ACT_ENVIRONMENT = true;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const msg = (uid, role, message, extra = {}) => ({ uid, role, content: { message }, timestamp: 1, ...extra });
const textOf = node => (typeof node === 'string' ? node : (node.children || []).map(textOf).join(''));

test('the preview is the beginning of what the bubble shows, as one plain line', () => {
  assert.equal(
    messagePreviewText(msg('a', 'assistant', '## Plan\n\n- **Step one**: read [the docs](https://x.y)\n- `run` it')),
    'Plan Step one: read the docs run it'
  );
  // The reference prefix and pasted blocks are not what the user typed.
  assert.equal(
    messagePreviewText(msg('u', 'user', 'Elemento referenciado: "Invoice 42"\n\nWhy is it late?')),
    'Why is it late?'
  );
  const long = 'x'.repeat(400);
  assert.equal(messagePreviewText(msg('l', 'assistant', long)).length, 161);
  // A guardrail payload is an object, not text.
  assert.equal(messagePreviewText({ uid: 'g', role: 'assistant', content: { message: { info: {} } } }), '');
});

test('the thumbnail is the first image, or else the first file', () => {
  const files = [
    { name: 'report.pdf', downloadUrl: 'https://f/report.pdf', fileType: 'DOCUMENT' },
    { name: 'photo.png', downloadUrl: 'https://f/photo.png', fileType: 'IMAGE' },
  ];
  assert.deepEqual(messageThumbnail({ uid: 'm', role: 'user', content: { files } }), {
    kind: 'image', url: 'https://f/photo.png', name: 'photo.png',
  });
  assert.deepEqual(messageThumbnail({ uid: 'm', role: 'user', content: { files: [files[0]] } }), {
    kind: 'file', name: 'report.pdf', extension: 'PDF',
  });
  assert.equal(messageThumbnail(msg('m', 'user', 'no files')), undefined);
});

test('only messages the server already has can be pinned', () => {
  assert.equal(isPinnableMessage(msg('a', 'assistant', 'hi')), true);
  assert.equal(isPinnableMessage(msg('temp-1', 'user', 'hi', { serverUid: 's1' })), true);
  assert.equal(isPinnableMessage(msg('temp-1', 'user', 'hi')), false);
  assert.equal(isPinnableMessage(msg('q', 'user', 'hi', { queued: true })), false);
  assert.equal(isPinnableMessage(msg('s', 'assistant', 'hi', { streaming: true })), false);
  assert.equal(isPinnableMessage(msg('t', 'tool', 'hi')), false);
});

test('pins resolve against the messages on screen, in conversation order', () => {
  const messages = [
    msg('temp-1', 'user', 'first', { serverUid: 'u1' }),
    msg('a1', 'assistant', 'second'),
    msg('a2', 'assistant', 'third'),
  ];
  const pins = [
    { messageUid: 'a2', role: 'assistant', pinnedAt: 1 },
    { messageUid: 'gone', role: 'assistant', pinnedAt: 2 },
    { messageUid: 'u1', role: 'user', pinnedAt: 3 },
  ];
  const views = buildPinnedMessageViews(pins, messages);
  assert.deepEqual(views.map(v => v.messageUid), ['u1', 'a2']);
  assert.equal(views[0].message.uid, 'temp-1');
  assert.equal(views[0].preview, 'first');
});

test('the bar walks back through the pins and unpins the one it shows', async () => {
  const messages = [msg('a', 'assistant', 'Alpha'), msg('b', 'user', 'Bravo'), msg('c', 'assistant', 'Charlie')];
  const pins = buildPinnedMessageViews(
    ['a', 'b', 'c'].map((uid, i) => ({ messageUid: uid, role: 'assistant', pinnedAt: i })),
    messages
  );
  const jumps = [];
  const unpinned = [];
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(PinnedMessagesBar, {
      pins, scrollToMessage: uid => jumps.push(uid), unpin: uid => unpinned.push(uid),
    }));
  });
  const root = renderer.root;
  const segments = root.findAll(n => n.props.className === 'devic-pinned-segment');
  assert.equal(segments.length, 3);
  assert.deepEqual(segments.map(s => s.props['data-active']), ['false', 'false', 'true']);
  const title = () => textOf(root.find(n => n.props.className === 'devic-pinned-title'));
  assert.equal(title(), 'Pinned message #3');

  const main = root.find(n => n.props.className === 'devic-pinned-main');
  await act(async () => main.props.onClick());
  await act(async () => root.find(n => n.props.className === 'devic-pinned-main').props.onClick());
  assert.deepEqual(jumps, ['c', 'b']);
  assert.equal(title(), 'Pinned message #1');

  const unpinButton = root.findAll(n => n.type === 'button' && n.props['aria-label'] === 'Unpin message')[0];
  await act(async () => unpinButton.props.onClick());
  assert.deepEqual(unpinned, ['a']);

  // Every pin at once, each with its own unpin.
  const listeners = new Map();
  const hadDocument = 'document' in global;
  global.document ??= {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: type => listeners.delete(type),
  };
  try {
    const listToggle = root.find(n => n.type === 'button' && n.props['aria-label'] === 'All pinned messages');
    await act(async () => listToggle.props.onClick());
    assert.equal(root.findAll(n => n.props.className === 'devic-pinned-list-item').length, 3);
    // Escape closes it.
    await act(async () => listeners.get('keydown')?.({ key: 'Escape' }));
    assert.equal(root.findAll(n => n.props.className === 'devic-pinned-list-item').length, 0);
    await act(async () => renderer.unmount());
  } finally {
    if (!hadDocument) delete global.document;
  }
});

test('messages carry a pin button only when the server can pin them', async () => {
  const messages = [
    msg('a1', 'assistant', 'Stored reply'),
    msg('temp-9', 'user', 'Not matched yet'),
    msg('temp-1', 'user', 'Matched', { serverUid: 'u1' }),
    msg('s1', 'assistant', 'Still streaming', { streaming: true }),
  ];
  const toggles = [];
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(ChatMessages, {
      messages, allMessages: messages, isLoading: false,
      pinnedMessageUids: ['u1'],
      onTogglePin: (uid, pinned) => toggles.push([uid, pinned]),
    }), { createNodeMock: () => ({ scrollHeight: 0, scrollTop: 0, clientHeight: 0 }) });
  });
  const pinButtons = renderer.root.findAll(
    n => n.type === 'button' && /^(Pin|Unpin) message$/.test(n.props['aria-label'] || '')
  );
  assert.deepEqual(pinButtons.map(b => b.props['aria-label']), ['Pin message', 'Unpin message']);
  await act(async () => pinButtons[0].props.onClick());
  await act(async () => pinButtons[1].props.onClick());
  // Pinned by the server uid, not the optimistic one the list renders under.
  assert.deepEqual(toggles, [['a1', true], ['u1', false]]);
  const pinned = renderer.root.findAll(n => n.props['data-pinned'] === 'true');
  assert.deepEqual(pinned.map(n => n.props['data-message-uid']), ['u1']);
  await act(async () => renderer.unmount());
});

function mockApi({ failPin = false } = {}) {
  const calls = [];
  let stored = [{ messageUid: 'u1', role: 'user', pinnedAt: 1 }];
  const chatContent = [msg('u1', 'user', 'Question'), msg('a1', 'assistant', 'Answer')];
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
  const listing = () => ({
    chatUid: 'chat-1',
    maxPinnedMessages: 50,
    pinnedMessages: stored.map(p => ({ ...p, message: chatContent.find(m => m.uid === p.messageUid) })),
  });
  const fetch = async (url, init = {}) => {
    const { pathname } = new URL(url);
    const method = init.method || 'GET';
    calls.push([method, pathname, init.body ? JSON.parse(init.body) : undefined]);
    if (pathname.endsWith('/pins') && method === 'POST') {
      if (failPin) return json({ statusCode: 400, message: 'A conversation can keep at most 50 pinned messages. Unpin one first.' }, 400);
      const { messageUid } = JSON.parse(init.body);
      stored = [...stored, { messageUid, role: 'assistant', pinnedAt: 2, pinnedBy: 'user-1' }];
      return json({ success: true, data: listing() });
    }
    if (pathname.includes('/pins/') && method === 'DELETE') {
      const uid = decodeURIComponent(pathname.split('/pins/')[1]);
      stored = stored.filter(p => p.messageUid !== uid);
      return json({ success: true, data: listing() });
    }
    if (pathname.endsWith('/pins')) return json({ success: true, data: listing() });
    if (pathname.endsWith('/realtime')) return json({ chatUID: 'chat-1', status: 'completed', chatHistory: chatContent });
    if (pathname.endsWith('/chat-1')) return json({ chatUID: 'chat-1', chatContent, pinnedMessages: stored });
    return json({ identifier: 'assistant', messageQueueEnabled: false });
  };
  return { calls, fetch };
}

async function mountChat(api) {
  const original = global.fetch;
  global.fetch = api.fetch;
  let chat, renderer;
  const errors = [];
  function Probe() {
    chat = useDevicChat({
      assistantId: 'assistant', apiKey: 'test', baseUrl: 'http://api.test',
      chatUid: 'chat-1', messageQueue: false, onError: e => errors.push(e.message),
    });
    return null;
  }
  await act(async () => { renderer = create(React.createElement(Probe)); });
  await act(async () => { await sleep(50); });
  return {
    get: () => chat,
    errors,
    unmount: async () => { await act(async () => renderer.unmount()); global.fetch = original; },
  };
}

test('the hook loads the pins with the conversation and pins by server uid', async () => {
  const api = mockApi();
  const probe = await mountChat(api);
  try {
    assert.deepEqual(probe.get().pinnedMessages.map(p => p.messageUid), ['u1']);
    let pending;
    await act(async () => { pending = probe.get().pinMessage('a1'); });
    // Shown at once, before the API answers.
    assert.deepEqual(probe.get().pinnedMessages.map(p => p.messageUid), ['u1', 'a1']);
    await act(async () => { await pending; });
    assert.equal(probe.get().pinnedMessages[1].pinnedBy, 'user-1');
    assert.deepEqual(api.calls.find(c => c[0] === 'POST'), ['POST', '/api/v1/assistants/assistant/chats/chat-1/pins', { messageUid: 'a1' }]);

    await act(async () => { await probe.get().unpinMessage('u1'); });
    assert.deepEqual(probe.get().pinnedMessages.map(p => p.messageUid), ['a1']);
    assert.ok(api.calls.some(c => c[0] === 'DELETE' && c[1] === '/api/v1/assistants/assistant/chats/chat-1/pins/u1'));
  } finally { await probe.unmount(); }
});

test('a refused pin is rolled back and reported', async () => {
  const api = mockApi({ failPin: true });
  const probe = await mountChat(api);
  try {
    await act(async () => {
      await assert.rejects(probe.get().pinMessage('a1'), /at most 50 pinned messages/);
    });
    await act(async () => { await sleep(20); });
    assert.deepEqual(probe.get().pinnedMessages.map(p => p.messageUid), ['u1']);
    assert.match(probe.errors[0], /at most 50 pinned messages/);
    // What the server has is re-read rather than trusted from memory.
    assert.ok(api.calls.some(c => c[0] === 'GET' && c[1].endsWith('/chat-1/pins')));
  } finally { await probe.unmount(); }
});

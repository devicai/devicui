const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { loadTs } = require('./helpers/loadTs.cjs');
const { ConversationSelector } = loadTs(path.join(__dirname, '../src/components/ChatDrawer/ConversationSelector.tsx'));
const { DevicApiClient } = loadTs(path.join(__dirname, '../src/api/client.ts'));

test('firstMessage labels and search use the user text after the reference prefix', async (t) => {
  const question = 'Where is the report?';
  const plain = 'Explain the phrase Elemento referenciado';
  const messages = {
    referenced: 'Elemento referenciado: "PROMO-42", "REPORT"\n\n' + question,
    plain,
    empty: 'Elemento referenciado: "PROMO-42"\n\n',
  };
  const date = Date.UTC(2020, 1, 3, 12);
  const histories = Object.keys(messages).map(chatUID => ({ chatUID, creationTimestampMs: date }));
  t.mock.method(DevicApiClient.prototype, 'listConversations', async () => ({ histories, total: histories.length }));
  t.mock.method(DevicApiClient.prototype, 'getChatHistory', async (_, chatUID) => ({
    chatContent: [{ role: 'user', content: { message: messages[chatUID] } }],
  }));
  global.document = new EventTarget();
  t.after(() => { delete global.document; });
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(ConversationSelector, {
      assistantId: 'assistant', apiKey: 'test', currentChatUid: 'referenced', conversationPreview: 'firstMessage',
    }));
  });
  try {
    const root = renderer.root;
    await act(async () => root.findByProps({ className: 'devic-conversation-selector-trigger' }).props.onClick());
    const labels = () => root.findAllByProps({ className: 'devic-conversation-item-name' }).map(n => n.children[0]);
    const fallback = root.findAllByProps({ className: 'devic-conversation-item-date' })[2].children[0];
    assert.deepEqual(labels(), [question, plain, fallback]);
    assert.equal(root.findByProps({ className: 'devic-conversation-selector-label' }).children[0], question);
    const search = root.findByType('input');
    await act(async () => search.props.onChange({ target: { value: 'promo-42' } }));
    assert.deepEqual(labels(), []);
    await act(async () => search.props.onChange({ target: { value: 'report' } }));
    assert.deepEqual(labels(), [question]);
  } finally {
    await act(async () => renderer.unmount());
  }
});

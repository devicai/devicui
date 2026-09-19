const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { loadTs } = require('./helpers/loadTs.cjs');

global.IS_REACT_ACT_ENVIRONMENT = true;
const src = (file) => path.join(__dirname, '../src', file);

test('the API client sends the selected stop scope', async () => {
  const { DevicApiClient } = loadTs(src('api/client.ts'));
  const bodies = [];
  global.fetch = async (_url, init = {}) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ chatUid: 'chat-1', message: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const client = new DevicApiClient({ apiKey: 'key', baseUrl: 'http://api.test' });

  await client.stopChat('assistant', 'chat-1');
  await client.stopChat('assistant', 'chat-1', 'conversation');

  assert.deepEqual(bodies, [{ scope: 'turn' }, { scope: 'conversation' }]);
});

test('the drawer stop control makes conversation cancellation primary', async () => {
  const { ChatInput } = loadTs(src('components/ChatDrawer/ChatInput.tsx'));
  const scopes = [];
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(ChatInput, {
      onSend: async () => ({ queued: false }),
      onStop: async (scope) => { scopes.push(scope); },
      isProcessing: true,
      canCancelConversation: true,
    }));
  });

  const root = renderer.root;
  const primary = root.findByProps({ title: 'Cancel conversation and subagents' });
  await act(async () => { primary.props.onClick(); });
  const secondary = root.findAllByType('button').find(
    (button) => button.children.includes('Stop current response'),
  );
  await act(async () => { secondary.props.onClick({ currentTarget: { closest: () => null } }); });

  assert.deepEqual(scopes, ['conversation', 'turn']);
  await act(async () => { renderer.unmount(); });
});

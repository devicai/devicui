const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { loadTs } = require('./helpers/loadTs.cjs');

global.IS_REACT_ACT_ENVIRONMENT = true;
const src = (file) => path.join(__dirname, '../src', file);

test('the API client submits MCP elicitation decisions', async () => {
  const { DevicApiClient } = loadTs(src('api/client.ts'));
  const original = global.fetch;
  let request;
  global.fetch = async (url, init = {}) => {
    request = { url: String(url), ...init };
    return new Response(JSON.stringify({ chatUid: 'chat-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const client = new DevicApiClient({ apiKey: 'key', baseUrl: 'http://api.test' });
    const decisions = [{ id: 'request-1', action: 'accept', content: { name: 'Ada' } }];
    await client.resolveMcpElicitations('assistant', 'chat-1', decisions);
    assert.equal(request.method, 'POST');
    assert.equal(request.url, 'http://api.test/api/v1/assistants/assistant/chats/chat-1/mcp-elicitations');
    assert.deepEqual(JSON.parse(request.body), { decisions });
  } finally {
    global.fetch = original;
  }
});

test('a custom MCP elicitation renderer receives the resolution action', async () => {
  const { McpElicitationCard } = loadTs(
    src('components/ChatDrawer/McpElicitationCard.tsx'),
  );
  const elicitations = [{
    id: 'request-1',
    toolCallId: 'call-1',
    toolServerId: 'server-1',
    toolServerName: 'CRM',
    toolName: 'create_contact',
    arguments: {},
    mode: 'form',
    message: 'Choose a contact name',
    requestedSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    protocol: 'modern',
    requestedAt: Date.now(),
  }];
  let submitted;
  let view;
  await act(async () => {
    view = create(React.createElement(McpElicitationCard, {
      elicitations,
      onResolve: async (decisions) => { submitted = decisions; },
      renderer: ({ elicitations: pending, onResolve }) => React.createElement(
        'button',
        {
          className: 'custom-elicitation',
          onClick: () => onResolve(pending.map(({ id }) => ({ id, action: 'decline' }))),
        },
        `Answer ${pending[0].toolName}`,
      ),
    }));
  });
  await act(async () => {
    await view.root.findByProps({ className: 'custom-elicitation' }).props.onClick();
  });
  assert.deepEqual(submitted, [{ id: 'request-1', action: 'decline' }]);
  await act(async () => view.unmount());
});

const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

test('renders a synthetic subagent result as an execution card', async () => {
  const { SubagentResultCard } = await import('../dist/esm/index.js');
  const html = renderToStaticMarkup(
    React.createElement(SubagentResultCard, {
      message: {
        uid: 'result-1',
        role: 'user',
        source: 'subagent',
        synthetic: true,
        eventType: 'subagent_result',
        timestamp: Date.now(),
        subagent: {
          threadId: 'thread-1',
          agentId: 'agent-1',
          agentName: 'Researcher',
          executionMode: 'async',
        },
        content: {
          message: '[Async subagent result]',
          data: { status: 'completed', result: 'Verified **in parallel**.' },
        },
      },
    }),
  );

  assert.match(html, /devic-subagent-result/);
  assert.match(html, /Researcher/);
  assert.match(html, /Verified/);
  assert.doesNotMatch(html, /devic-message-bubble/);
});

test('renders every parallel handoff call and its acknowledged agent name', async () => {
  const { ChatMessages } = await import('../dist/esm/index.js');
  const assistant = {
    uid: 'assistant-1',
    role: 'assistant',
    timestamp: Date.now(),
    content: {},
    tool_calls: [
      { id: 'call-1', type: 'function', function: { name: 'hand_off_subagent', arguments: '{}' } },
      { id: 'call-2', type: 'function', function: { name: 'hand_off_subagent', arguments: '{}' } },
    ],
  };
  const messages = [
    assistant,
    {
      uid: 'tool-1', role: 'tool', timestamp: Date.now(), tool_call_id: 'call-1',
      content: { data: { subThreadId: 'thread-1', agent: { id: 'agent-1', name: 'Researcher' } } },
    },
    {
      uid: 'tool-2', role: 'tool', timestamp: Date.now(), tool_call_id: 'call-2',
      content: { data: { subThreadId: 'thread-2', agent: { id: 'agent-2', name: 'Critic' } } },
    },
  ];
  const html = renderToStaticMarkup(
    React.createElement(ChatMessages, {
      messages,
      allMessages: messages,
      isLoading: false,
    }),
  );

  assert.equal((html.match(/devic-handoff-widget/g) || []).length, 2);
  assert.match(html, /Researcher/);
  assert.match(html, /Critic/);
});

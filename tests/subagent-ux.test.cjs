const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { act, create } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;

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

test('polls subagent state without task or directory enrichment', async () => {
  const { HandoffSubagentWidget } = await import('../dist/esm/index.js');
  const originalFetch = global.fetch;
  const requests = [];
  let observedThread = null;
  let renderer;

  global.fetch = async (url) => {
    requests.push(String(url));
    return new Response(JSON.stringify({
      _id: 'thread-1',
      agentId: 'agent-1',
      state: 'completed',
      threadContent: [],
    }), { headers: { 'Content-Type': 'application/json' } });
  };

  try {
    await act(async () => {
      renderer = create(React.createElement(HandoffSubagentWidget, {
        subThreadId: 'thread-1',
        agentHint: { _id: 'agent-1', name: 'Researcher' },
        apiKey: 'test',
        baseUrl: 'http://api.test',
        renderWidget: ({ thread }) => {
          observedThread = thread;
          return null;
        },
      }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0], 'http://api.test/api/v1/agents/threads/thread-1');
    assert.equal(observedThread?.state, 'completed');
  } finally {
    await act(async () => renderer?.unmount());
    global.fetch = originalFetch;
  }
});

test('streams subagent lifecycle snapshots without polling', async () => {
  const { HandoffSubagentWidget } = await import('../dist/esm/index.js');
  const originalFetch = global.fetch;
  const requests = [];
  const states = [];
  let completed = 0;
  let renderer;

  global.fetch = async (url) => {
    requests.push(String(url));
    const frames = ['queued', 'processing', 'completed'].map((state) =>
      `event: snapshot\ndata: ${JSON.stringify({
        _id: 'thread-streamed',
        agentId: 'agent-1',
        state,
        threadContent: [],
      })}\n\n`
    );
    return new Response(new ReadableStream({
      async start(controller) {
        for (const frame of frames) {
          controller.enqueue(new TextEncoder().encode(frame));
          await new Promise(resolve => setTimeout(resolve, 5));
        }
        controller.close();
      },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
  };

  try {
    await act(async () => {
      renderer = create(React.createElement(HandoffSubagentWidget, {
        subThreadId: 'thread-streamed',
        agentHint: { _id: 'agent-1', name: 'Researcher' },
        apiKey: 'test',
        baseUrl: 'http://api.test',
        streaming: true,
        onCompleted: () => { completed += 1; },
        renderWidget: ({ thread }) => {
          if (thread?.state && states.at(-1) !== thread.state) states.push(thread.state);
          return null;
        },
      }));
      await new Promise(resolve => setTimeout(resolve, 40));
    });

    assert.deepEqual(states, ['queued', 'processing', 'completed']);
    assert.equal(completed, 1);
    assert.deepEqual(requests, [
      'http://api.test/api/v1/agents/threads/thread-streamed/stream',
    ]);
  } finally {
    await act(async () => renderer?.unmount());
    global.fetch = originalFetch;
  }
});

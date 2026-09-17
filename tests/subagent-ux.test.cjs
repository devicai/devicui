const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { act, create } = require('react-test-renderer');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs.cjs');

global.IS_REACT_ACT_ENVIRONMENT = true;

function parallelActivityMessages(extra = []) {
  return [
    {
      uid: 'user-activity', role: 'user', timestamp: 1,
      content: { message: 'Run both in parallel' },
    },
    {
      uid: 'assistant-activity', role: 'assistant', timestamp: 2, content: {},
      tool_calls: [
        { id: 'activity-call-1', type: 'function', function: { name: 'hand_off_subagent', arguments: '{}' } },
        { id: 'activity-call-2', type: 'function', function: { name: 'hand_off_subagent', arguments: '{}' } },
      ],
    },
    {
      uid: 'activity-tool-1', role: 'tool', timestamp: 3, tool_call_id: 'activity-call-1',
      content: { data: { subThreadId: 'activity-thread-1', asynchronous: true, agent: { id: 'agent-1', name: 'Researcher' } } },
    },
    {
      uid: 'activity-tool-2', role: 'tool', timestamp: 4, tool_call_id: 'activity-call-2',
      content: { data: { subThreadId: 'activity-thread-2', executionMode: 'async', agent: { id: 'agent-2', name: 'Critic' } } },
    },
    ...extra,
  ];
}

test('renders multiple async subagents in the compact prompt tray', async () => {
  const { SubagentActivityTray, collectSubagentActivities } = await import('../dist/esm/index.js');
  const messages = parallelActivityMessages([{
    uid: 'activity-result-1',
    role: 'user',
    source: 'subagent',
    synthetic: true,
    eventType: 'subagent_result',
    timestamp: 5,
    subagent: {
      threadId: 'activity-thread-1',
      agentId: 'agent-1',
      agentName: 'Researcher',
      executionMode: 'async',
    },
    content: { data: { status: 'completed', result: 'Done' } },
  }, {
    uid: 'blocking-launch', role: 'assistant', timestamp: 6, content: {},
    tool_calls: [{ id: 'blocking-call', type: 'function', function: { name: 'hand_off_subagent', arguments: '{}' } }],
  }, {
    uid: 'blocking-tool', role: 'tool', timestamp: 7, tool_call_id: 'blocking-call',
    content: { data: { subThreadId: 'blocking-thread', executionMode: 'wait', handedOff: true, agent: { id: 'agent-wait', name: 'Blocking agent' } } },
  }]);
  const html = renderToStaticMarkup(
    React.createElement(SubagentActivityTray, { messages }),
  );

  assert.equal((html.match(/devic-subagent-activity-item/g) || []).length, 2);
  assert.match(html, /Researcher/);
  assert.match(html, /Critic/);
  assert.match(html, /data-status="completed"/);
  assert.match(html, /data-status="running"/);
  assert.match(html, /Dismiss subagent activity/);
  assert.doesNotMatch(html, /Blocking agent/);
  assert.deepEqual(
    collectSubagentActivities(messages).map((activity) => activity.agentName),
    ['Critic', 'Researcher'],
  );
});

test('compact subagent tray stays closed for the same group and reopens for a new child', async () => {
  const { SubagentActivityTray } = await import('../dist/esm/index.js');
  const initial = parallelActivityMessages();
  let closed = 0;
  let renderer;

  await act(async () => {
    renderer = create(React.createElement(SubagentActivityTray, {
      messages: initial,
      onClose: () => { closed += 1; },
    }));
  });

  await act(async () => {
    renderer.root.findByProps({ className: 'devic-subagent-activity-close' }).props.onClick();
  });
  assert.equal(closed, 1);
  assert.equal(renderer.root.findAllByProps({ className: 'devic-subagent-activity' }).length, 0);

  const withNewChild = [
    ...initial,
    {
      uid: 'assistant-activity-2', role: 'assistant', timestamp: 6, content: {},
      tool_calls: [{ id: 'activity-call-3', type: 'function', function: { name: 'hand_off_subagent', arguments: '{}' } }],
    },
    {
      uid: 'activity-tool-3', role: 'tool', timestamp: 7, tool_call_id: 'activity-call-3',
      content: { data: { subThreadId: 'activity-thread-3', asynchronous: true, agent: { id: 'agent-3', name: 'Verifier' } } },
    },
  ];
  await act(async () => {
    renderer.update(React.createElement(SubagentActivityTray, {
      messages: withNewChild,
      onClose: () => { closed += 1; },
    }));
  });

  assert.equal(renderer.root.findAllByProps({ className: 'devic-subagent-activity' }).length, 1);
  assert.equal(renderer.root.findAllByProps({ className: 'devic-subagent-activity-item' }).length, 3);
  await act(async () => renderer.unmount());
});

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
  assert.match(html, /devic-subagent-result-preview/);
  assert.match(html, /<details/);
  assert.doesNotMatch(html, /devic-message-bubble/);
});

test('stacks compact results delivered by the same parallel run', async () => {
  const { SubagentResultCard } = await import('../dist/esm/index.js');
  const message = {
    uid: 'parallel-results',
    role: 'user',
    source: 'subagent',
    synthetic: true,
    eventType: 'subagent_results',
    timestamp: Date.now(),
    content: {
      data: {
        subagentResults: [{
          subagent: { threadId: 'thread-1', agentName: 'Researcher', executionMode: 'async' },
          status: 'completed',
          result: 'A'.repeat(180),
        }, {
          subagent: { threadId: 'thread-2', agentName: 'Critic', executionMode: 'async' },
          status: 'failed',
          error: 'Could not verify the result',
        }],
      },
    },
  };
  const html = renderToStaticMarkup(React.createElement(SubagentResultCard, { message }));

  assert.match(html, /data-stacked="true"/);
  assert.match(html, /data-result-count="2"/);
  assert.equal((html.match(/<details/g) || []).length, 2);
  assert.match(html, /Researcher/);
  assert.match(html, /Critic/);
  assert.match(html, /A{140}…/);
});

test('groups consecutive subagent results into one aggregate widget receiving an array', async () => {
  const { ChatMessages } = await import('../dist/esm/index.js');
  const resultMessage = (uid, callId, threadId, agentName, timestamp) => ({
    uid,
    role: 'user',
    source: 'subagent',
    synthetic: true,
    eventType: 'subagent_result',
    timestamp,
    subagent: {
      threadId,
      parentToolCallId: callId,
      agentName,
      executionMode: 'async',
    },
    content: {
      message: `[Async subagent result] ${agentName}`,
      data: { status: 'completed', result: `${agentName} finished` },
    },
  });
  const messages = [
    resultMessage('separate-result-1', 'parallel-call-1', 'thread-1', 'Researcher', 2),
    { uid: 'hidden-tool-message', role: 'tool', timestamp: 3, tool_call_id: 'ignored', content: {} },
    resultMessage('separate-result-2', 'parallel-call-2', 'thread-2', 'Critic', 4),
    { uid: 'final-answer', role: 'assistant', timestamp: 5, content: { message: 'Both results received.' } },
  ];
  const html = renderToStaticMarkup(React.createElement(ChatMessages, {
    messages,
    allMessages: messages,
    isLoading: false,
  }));

  assert.equal((html.match(/class="devic-subagent-results"/g) || []).length, 1);
  assert.equal((html.match(/<details/g) || []).length, 2);
  assert.match(html, /data-stacked="true"/);
  assert.match(html, /data-message-count="2"/);
  assert.match(html, /Researcher/);
  assert.match(html, /Critic/);
});

test('a visible conversation message splits consecutive subagent result groups', async () => {
  const { ChatMessages } = await import('../dist/esm/index.js');
  const result = (uid, name, timestamp) => ({
    uid, role: 'user', source: 'subagent', synthetic: true,
    eventType: 'subagent_result', timestamp,
    subagent: { threadId: uid, agentName: name, executionMode: 'async' },
    content: { message: name, data: { status: 'completed', result: `${name} finished` } },
  });
  const messages = [
    result('result-a', 'Researcher', 1),
    { uid: 'answer-between-runs', role: 'assistant', timestamp: 2, content: { message: 'Run complete.' } },
    result('result-b', 'Critic', 3),
  ];
  const html = renderToStaticMarkup(React.createElement(ChatMessages, {
    messages,
    allMessages: messages,
    isLoading: false,
  }));

  assert.equal((html.match(/class="devic-subagent-results"/g) || []).length, 2);
  assert.equal((html.match(/data-message-count="1"/g) || []).length, 2);
});

test('aggregates consecutive parallel handoffs into one compact widget', async () => {
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
      isLoading: true,
    }),
  );

  assert.equal((html.match(/class="devic-handoff-group"/g) || []).length, 1);
  assert.equal((html.match(/class="devic-handoff-compact"/g) || []).length, 2);
  assert.match(html, /class="devic-handoff-group" role="group"/);
  assert.match(html, /data-subagent-count="2"/);
  assert.doesNotMatch(html, /devic-handoff-group-footer/);
  assert.match(html, /Researcher/);
  assert.match(html, /Critic/);
});

test('renders a batched handoff tool response as multiple parallel executions', async () => {
  const { ChatMessages, collectSubagentActivities } = await import('../dist/esm/index.js');
  const executions = Array.from({ length: 5 }, (_, index) => ({
    subThreadId: `batch-thread-${index + 1}`,
    agent: {
      id: index < 3 ? 'agent-researcher' : 'agent-critic',
      name: index < 3 ? 'Researcher' : 'Critic',
    },
  }));
  const messages = [{
    uid: 'batch-assistant', role: 'assistant', timestamp: 1, content: {},
    tool_calls: [{
      id: 'batch-call', type: 'function',
      function: { name: 'hand_off_subagent', arguments: JSON.stringify({
        executionMode: 'async',
        executions: executions.map((execution, index) => ({
          agentId: execution.agent.id,
          input: `Task ${index + 1}`,
        })),
      }) },
    }],
  }, {
    uid: 'batch-tool', role: 'tool', timestamp: 2, tool_call_id: 'batch-call',
    content: { data: {
      asynchronous: true,
      executionMode: 'async',
      launched: 5,
      executions,
    } },
  }];

  const html = renderToStaticMarkup(React.createElement(ChatMessages, {
    messages,
    allMessages: messages,
    isLoading: true,
  }));

  assert.equal(collectSubagentActivities(messages).length, 5);
  assert.match(html, /data-subagent-count="5"/);
  assert.match(html, /data-visible-count="3"/);
  assert.equal((html.match(/class="devic-handoff-compact"/g) || []).length, 5);
  assert.match(html, />2 more</);
  assert.match(html, /Researcher/);
  assert.match(html, /Critic/);
});

test('keeps every unfinished execution from one batched handoff under SSE observation', () => {
  const { pendingAsyncSubagentIds } = loadTs(path.join(
    __dirname,
    '../src/utils/asyncSubagents.ts',
  ));
  const messages = [{
    uid: 'batch-tool', role: 'tool', timestamp: 1, tool_call_id: 'batch-call',
    content: {
      asynchronous: true,
      executionMode: 'async',
      executions: [1, 2, 3].map((index) => ({
        subThreadId: `batch-thread-${index}`,
        agent: { id: `agent-${index}`, name: `Agent ${index}` },
      })),
    },
  }, {
    uid: 'batch-result', role: 'user', timestamp: 2,
    source: 'subagent', synthetic: true, eventType: 'subagent_result',
    subagent: { threadId: 'batch-thread-2' },
    content: { data: { status: 'completed', result: 'Done' } },
  }];

  assert.deepEqual(pendingAsyncSubagentIds(messages), [
    'batch-thread-1',
    'batch-thread-3',
  ]);
});

test('shows at most three handoffs and summarizes hidden children in the group footer', async () => {
  const { ChatMessages } = await import('../dist/esm/index.js');
  const calls = Array.from({ length: 7 }, (_, index) => ({
    id: `limit-call-${index + 1}`,
    type: 'function',
    function: { name: 'hand_off_subagent', arguments: '{}' },
  }));
  const assistant = {
    uid: 'limit-assistant',
    role: 'assistant',
    timestamp: Date.now(),
    content: {},
    tool_calls: calls,
  };
  const messages = [
    assistant,
    ...calls.map((call, index) => ({
      uid: `limit-tool-${index + 1}`,
      role: 'tool',
      timestamp: Date.now() + index + 1,
      tool_call_id: call.id,
      content: {
        data: {
          subThreadId: `limit-thread-${index + 1}`,
          agent: { id: `limit-agent-${index + 1}`, name: `Agent ${index + 1}` },
        },
      },
    })),
  ];
  const html = renderToStaticMarkup(React.createElement(ChatMessages, {
    messages,
    allMessages: messages,
    isLoading: true,
  }));

  assert.match(html, /data-subagent-count="7"/);
  assert.match(html, /data-visible-count="3"/);
  assert.match(html, /class="devic-handoff-monitor-only" hidden="" aria-hidden="true"/);
  assert.equal((html.match(/class="devic-handoff-compact"/g) || []).length, 7);
  assert.equal((html.match(/data-state="loading"/g) || []).length, 4);
  assert.match(html, />4 more</);
  assert.doesNotMatch(html, / max</);
  assert.match(html, /Agent 7/);
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

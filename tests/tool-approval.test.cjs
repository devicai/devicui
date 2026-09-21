const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { loadTs } = require("./helpers/loadTs.cjs");

global.IS_REACT_ACT_ENVIRONMENT = true;
const src = (file) => path.join(__dirname, "../src", file);

test("the API client submits every explicit tool decision", async () => {
  const { DevicApiClient } = loadTs(src("api/client.ts"));
  const original = global.fetch;
  let request;
  global.fetch = async (url, init = {}) => {
    request = { url: String(url), ...init };
    return new Response(
      JSON.stringify({ chatUid: "chat-1", message: "accepted" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  try {
    const client = new DevicApiClient({
      apiKey: "key",
      baseUrl: "http://api.test",
    });
    const decisions = [
      { toolCallId: "call-1", approved: true },
      { toolCallId: "call-2", approved: false },
    ];
    await client.resolveToolApprovals("assistant", "chat-1", decisions);
    assert.equal(request.method, "POST");
    assert.equal(
      request.url,
      "http://api.test/api/v1/assistants/assistant/chats/chat-1/tool-approvals",
    );
    assert.deepEqual(JSON.parse(request.body), { decisions });
  } finally {
    global.fetch = original;
  }
});

test("the shared approval card exposes context and makes one decision per call", async () => {
  const { ToolApprovalCard } = loadTs(
    src("components/ChatDrawer/ToolApprovalCard.tsx"),
  );
  const approvals = [
    {
      toolCallId: "call-1",
      toolServerId: "server-1",
      toolServerName: "Billing",
      toolName: "delete_invoice",
      arguments: { invoiceId: "inv-1" },
      categoryIds: ["billing-write"],
      categories: [{ id: "billing-write", name: "Billing write" }],
      requestedAt: Date.now(),
    },
    {
      toolCallId: "call-2",
      toolServerId: "server-1",
      toolName: "notify_customer",
      arguments: { customerId: "cus-1" },
      categoryIds: [],
      categories: [],
      requestedAt: Date.now(),
    },
  ];
  let submitted;
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(ToolApprovalCard, {
        approvals,
        onResolve: async (decisions) => {
          submitted = decisions;
        },
      }),
    );
  });

  assert.match(JSON.stringify(renderer.toJSON()), /delete_invoice/);
  assert.match(JSON.stringify(renderer.toJSON()), /Billing write/);
  const approve = renderer.root.findByProps({
    className: "devic-tool-approval__approve",
  });
  await act(async () => {
    approve.props.onClick();
  });
  assert.deepEqual(submitted, [
    { toolCallId: "call-1", approved: true },
    { toolCallId: "call-2", approved: true },
  ]);
  await act(async () => renderer.unmount());
});

test("the approval renderer can replace the card and use the resolution action", async () => {
  const { ToolApprovalCard } = loadTs(
    src("components/ChatDrawer/ToolApprovalCard.tsx"),
  );
  const approvals = [
    {
      toolCallId: "call-custom",
      toolServerId: "server-custom",
      toolName: "publish_report",
      arguments: { reportId: "report-1" },
      categoryIds: ["external-write"],
      categories: [{ id: "external-write", name: "External write" }],
      requestedAt: Date.now(),
    },
  ];
  let submitted;
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(ToolApprovalCard, {
        approvals,
        onResolve: async (decisions) => {
          submitted = decisions;
        },
        renderer: ({ approvals: pending, onResolve }) =>
          React.createElement(
            "button",
            {
              className: "custom-approval",
              onClick: () =>
                onResolve(
                  pending.map(({ toolCallId }) => ({
                    toolCallId,
                    approved: false,
                  })),
                ),
            },
            `Review ${pending[0].toolName}`,
          ),
      }),
    );
  });

  assert.match(JSON.stringify(renderer.toJSON()), /Review publish_report/);
  await act(async () => {
    await renderer.root.findByProps({ className: "custom-approval" }).props.onClick();
  });
  assert.deepEqual(submitted, [
    { toolCallId: "call-custom", approved: false },
  ]);
  await act(async () => renderer.unmount());
});

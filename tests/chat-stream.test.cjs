const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/utils/consumeChatStream.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const helper = { exports: {} }; new Function('exports', 'require', 'module', compiled)(helper.exports, require, helper);
test('SSE consumer handles single-byte UTF-8 chunks and multiple frames', async () => {
  const bytes = new TextEncoder().encode('event: snapshot\ndata: {"text":"España 😀"}\n\nevent: ping\ndata: {}\n\nevent: snapshot\ndata: {"status":"completed"}\n\n');
  const stream = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
  const snapshots = [];
  await helper.exports.consumeChatStream(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }), value => snapshots.push(value));
  assert.deepEqual(snapshots, [{ text: 'España 😀' }, { status: 'completed' }]);
});
test('rejects buffered JSON/old servers so the hook can retain polling', async () => {
  await assert.rejects(helper.exports.consumeChatStream(new Response('{}', { headers: { 'Content-Type': 'application/json' } }), () => {}), /unavailable/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMockServer } from '../src/server/runtime.js';

const snapshot = { server: { name: 'sample' }, tools: [{ name: 'echo', inputSchema: { type: 'object' } }] };

async function rawServer(t, { options = {}, fixtures = null, data = snapshot } = {}) {
  const mock = createMockServer({ snapshot: data, fixtures, options });
  assert.ok(mock.server instanceof McpServer);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const pending = new Map();
  let id = 0;
  clientTransport.onmessage = (message) => {
    const resolve = pending.get(message.id);
    if (resolve) { pending.delete(message.id); resolve(message); }
  };
  await clientTransport.start();
  await mock.connect(serverTransport);
  t.after(async () => { await mock.close(); await clientTransport.close(); });
  function request(method, params = {}) {
    const requestId = ++id;
    return new Promise((resolve, reject) => {
      pending.set(requestId, resolve);
      clientTransport.send({ jsonrpc: '2.0', id: requestId, method, params }).catch(reject);
    });
  }
  const initialized = await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'raw-test', version: '1' } });
  await clientTransport.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return { mock, request, initialized, call: (name = 'echo') => request('tools/call', { name, arguments: {} }) };
}

test('McpServer advanced handlers preserve initialization, ping, and unknown method', async (t) => {
  const { request, initialized } = await rawServer(t);
  assert.deepEqual(initialized.result.capabilities, { tools: { listChanged: false } });
  assert.deepEqual(initialized.result.serverInfo, { name: 'joons-mcp-mock-server', version: '0.1.0', title: 'MOCK of sample' });
  assert.equal(initialized.result.instructions, 'MOCK MCP SERVER for testing. Tool results come from fixtures; no real actions are performed.');
  assert.deepEqual((await request('ping')).result, {});
  assert.deepEqual((await request('not/a/method')).error, { code: -32601, message: 'Method not found' });
});

test('raw unknown and builtin protocol errors have exact code and message', async (t) => {
  const { call } = await rawServer(t, { options: { scenario: 'server-error' } });
  assert.deepEqual((await call('absent')).error, { code: -32602, message: 'Unknown tool: absent' });
  assert.deepEqual((await call()).error, { code: -32603, message: 'Mock server error (scenario server-error)' });
});

test('raw busy error is exact and unknown still precedes busy', async (t) => {
  const { call, mock } = await rawServer(t, { options: { scenario: 'slow', slowDelayMs: 30000, maxConcurrency: 1 } });
  const first = call();
  assert.deepEqual((await call()).error, { code: -32000, message: 'Mock server busy' });
  assert.deepEqual((await call('absent')).error, { code: -32602, message: 'Unknown tool: absent' });
  const closing = mock.close();
  assert.deepEqual((await first).result, { content: [{ type: 'text', text: 'Mock server closing' }], isError: true });
  await closing;
});

for (const [code, message] of [[-32042, 'Fixture protocol message'], [undefined, 'Internal fixture failure'], [-32043, 'MCP error -32043: intentional fixture prefix']]) {
  test('raw fixture protocol message stays exact: ' + message, async (t) => {
    const protocolError = code === undefined ? { message } : { code, message };
    const { call } = await rawServer(t, { fixtures: { tools: { echo: { default: { protocolError } } } } });
    assert.deepEqual((await call()).error, { code: code ?? -32603, message });
  });
}

// Enumerate the exact A3 ranges, including allowed tab/newline separately.
const removed = String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i).filter((i) => i !== 9 && i !== 10), ...Array.from({ length: 33 }, (_, i) => 127 + i), 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x061c);

test('raw titles/descriptions are sanitized, retain tab/newline, preserve fixture result data', async (t) => {
  const display = 'before' + removed + '\n\tafter';
  const payload = { content: [{ type: 'text', text: display }], structuredContent: { text: display, nested: [display] } };
  const data = { server: { name: display }, tools: [{ name: 'echo', title: display, description: display, inputSchema: { type: 'object' } }] };
  const fixtures = { tools: { echo: { default: payload } } };
  const { request, call, initialized } = await rawServer(t, { data, fixtures, options: { markDescriptions: true } });
  const tool = (await request('tools/list')).result.tools[0];
  assert.equal(tool.title, 'before\n\tafter');
  assert.equal(tool.description, '[MOCK] before\n\tafter');
  assert.equal(initialized.result.serverInfo.title, 'MOCK of before\n\tafter');
  assert.deepEqual((await call()).result, payload);
  assert.equal(data.tools[0].description, display);
  assert.equal(fixtures.tools.echo.default.content[0].text, display);
});

test('raw protocol messages sanitize before truncating and unknown names retain 100-char bound', async (t) => {
  const message = removed + 'safe\n\t' + 'x'.repeat(1100);
  const { call } = await rawServer(t, { fixtures: { tools: { echo: { default: { protocolError: { code: -32042, message } } } } } });
  assert.deepEqual((await call()).error, { code: -32042, message: ('safe\n\t' + 'x'.repeat(1100)).slice(0, 1000) });
  assert.deepEqual((await call(removed + 'unknown\n\t' + 'x'.repeat(120))).error, { code: -32602, message: 'Unknown tool: ' + ('unknown\n\t' + 'x'.repeat(120)).slice(0, 100) });
});

test('SDK client adds exactly its own single protocol error prefix', async (t) => {
  const mock = createMockServer({ snapshot, options: { scenario: 'server-error' } });
  const client = new Client({ name: 'test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await mock.close(); await client.close(); });
  await mock.connect(st);
  await client.connect(ct);
  await assert.rejects(client.callTool({ name: 'echo', arguments: {} }), (error) => {
    assert.equal(error.code, -32603);
    assert.equal(error.message, 'MCP error -32603: Mock server error (scenario server-error)');
    return true;
  });
});

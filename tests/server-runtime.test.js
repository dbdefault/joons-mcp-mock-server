import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMockServer } from '../src/server/runtime.js';

const snapshot = { server: { name: 'sample' }, tools: [
  { name: 'z', inputSchema: { type: 'object' }, title: null, description: null, outputSchema: null, annotations: null },
  { name: 'a', inputSchema: { type: 'object', required: ['q'] }, description: 'Example' }
] };
const text = (value, extra = {}) => ({ content: [{ type: 'text', text: value }], ...extra });
const fixtures = { scenarios: { outage: {} }, tools: { z: {
  default: text('default'), match: [{ arguments: { nested: { x: 1 } }, response: text('match') }],
  scenarios: { outage: text('outage', { isError: true }) }
} } };
async function setup(t, options = {}, data = fixtures, snap = snapshot) {
  const mock = createMockServer({ snapshot: snap, fixtures: data, options });
  const client = new Client({ name: 'test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await mock.connect(st);
  await client.connect(ct);
  t.after(async () => { await mock.close(); await client.close(); });
  return { mock, client, call: (name = 'z', args = {}) => client.callTool({ name, arguments: args }) };
}
test('real snapshot tools/list preserves supported fields, sorts, and omits null', async (t) => {
  const real = JSON.parse(await readFile(new URL('./fixtures/diff-example.json', import.meta.url), 'utf8'));
  const { client } = await setup(t, {}, null, real);
  const expected = real.tools.map((tool) => Object.fromEntries(['name', 'inputSchema', 'title', 'description', 'outputSchema', 'annotations'].filter((key) => tool[key] != null).map((key) => [key, tool[key]]))).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  assert.deepEqual((await client.listTools()).tools, expected);
  await client.ping();
});
test('default, subset deep match, fallback, and copies', async (t) => {
  const { call, mock } = await setup(t);
  assert.deepEqual(await call(), text('default'));
  const result = await call('z', { nested: { x: 1 }, extra: true });
  assert.deepEqual(result, text('match'));
  result.content[0].text = 'changed';
  assert.deepEqual(await call('z', { nested: { x: 1 } }), text('match'));
  assert.deepEqual(await call('z', { nested: { x: 2 } }), text('default'));
  assert.deepEqual(mock.report().calls.map((x) => x.source), ['fixture_default', 'fixture_match', 'fixture_match', 'fixture_default']);
});
test('fixture scenario overrides matches and default', async (t) => {
  const { call } = await setup(t, { scenario: 'outage' });
  assert.deepEqual(await call('z', { nested: { x: 1 } }), text('outage', { isError: true }));
});
for (const scenario of ['empty', 'error', 'server-error']) test('builtin precedence: ' + scenario, async (t) => {
  const { call } = await setup(t, { scenario, failTools: ['z'] });
  if (scenario === 'server-error') await assert.rejects(call(), (e) => e.code === -32603 && e.message.includes('Mock server error (scenario server-error)'));
  else assert.deepEqual(await call(), scenario === 'empty' ? { content: [] } : text('Mock error (scenario error)', { isError: true }));
});
test('fail tool overrides fixture scenario', async (t) => {
  const { call } = await setup(t, { scenario: 'outage', failTools: ['z'] });
  assert.deepEqual(await call(), text('Mock failure for this tool (--fail-tool)', { isError: true }));
});
for (const mode of ['error', 'empty', null]) test('missing fixture: ' + mode, async (t) => {
  const { call } = await setup(t, {}, mode ? { missingFixture: mode, tools: {} } : null);
  assert.deepEqual(await call(), mode === 'empty' ? { content: [] } : text('No mock fixture for this tool', { isError: true }));
});
test('validation precedes builtin; oversized arguments; validation bypass', async (t) => {
  const { call, mock } = await setup(t, { scenario: 'empty' });
  assert.equal((await call('a')).isError, true);
  assert.match((await call('z', { x: 'x'.repeat(1024 * 1024) })).content[0].text, /Arguments too large/);
  assert.equal(mock.report().calls[0].outcome, 'invalid_arguments');
  const other = await setup(t, { scenario: 'empty', validateArguments: false });
  assert.deepEqual(await other.call('a'), { content: [] });
});
test('structuredContent and protocolError code/message', async (t) => {
  const { call } = await setup(t, {}, { tools: { z: { default: text('data', { structuredContent: { items: [1] } }) }, a: { default: { protocolError: { code: -32042, message: 'Fixture unavailable' } } } } });
  assert.deepEqual((await call()).structuredContent, { items: [1] });
  await assert.rejects(call('a', { q: 1 }), (e) => e.code === -32042 && e.message.includes('Fixture unavailable'));
});
test('busy, unknown priority, sanitized recording, slow delay', async (t) => {
  const { call, mock } = await setup(t, { scenario: 'slow', slowDelayMs: 35, maxConcurrency: 1 });
  const first = call();
  await new Promise((r) => setImmediate(r));
  await assert.rejects(call(), (e) => e.code === -32000 && e.message.includes('Mock server busy'));
  await assert.rejects(call('\u001bunknown'), (e) => e.code === -32602 && e.message.includes('Unknown tool'));
  assert.deepEqual(await first, text('default'));
  assert.equal(mock.report().tools['<unknown tools>'].calls, 1);
  assert.equal(mock.report().calls[1].tool, 'unknown');
});
test('fixture delay and slow max obey timeout', async (t) => {
  const { call, mock } = await setup(t, { slowDelayMs: 5, scenario: 'slow', callTimeoutMs: 8 }, { tools: { z: { default: text('late', { delayMs: 40 }) } } });
  assert.deepEqual(await call(), text('Mock call timed out', { isError: true }));
  assert.equal(mock.report().lastCall.outcome, 'timeout');
});
test('close delivers pending result, clears delay, is idempotent', async (t) => {
  const { call, mock } = await setup(t, { scenario: 'slow', slowDelayMs: 30000 });
  const response = call();
  await new Promise((r) => setImmediate(r));
  const close = mock.close();
  assert.equal(mock.close(), close);
  assert.deepEqual(await response, text('Mock server closing', { isError: true }));
  await close;
});
test('same sequence gives identical results and report', async (t) => {
  const run = async () => {
    const { call, mock } = await setup(t);
    const results = [await call(), await call('z', { nested: { x: 1 } }), await call('a')];
    return { results, report: mock.report() };
  };
  assert.deepEqual(await run(), await run());
});
test('configuration rejects unknown scenarios and invalid limits', () => {
  for (const options of [{ scenario: 'absent' }, { maxConcurrency: 0 }, { callTimeoutMs: 0 }, { slowDelayMs: 30001 }]) assert.throws(() => createMockServer({ snapshot, options }));
});
test('report retains first 1000 protocol calls and counts all calls', async (t) => {
  const { call, mock } = await setup(t);
  for (let i = 0; i < 1001; i++) await call('z', { i });
  const report = mock.report();
  assert.equal(report.calls.length, 1000);
  assert.equal(report.droppedCalls, 1);
  assert.equal(report.totals.calls, 1001);
  assert.equal(report.lastCall.seq, 1001);
  assert.deepEqual(report.tools.z.lastArguments, { i: 1000 });
});
test('protocol recording masks nested secrets and custom keys, or omits arguments', async (t) => {
  const { call, mock } = await setup(t, { maskKeys: ['sensitive'] });
  await call('z', { nested: [{ TOKEN: 'hidden', sensitive: 'hidden', plain: 'visible' }] });
  assert.deepEqual(mock.report().lastCall.arguments, { nested: [{ TOKEN: '[MASKED]', sensitive: '[MASKED]', plain: 'visible' }] });
  const other = await setup(t, { recordArguments: false });
  await other.call('z', { token: 'hidden' });
  assert.equal(Object.hasOwn(other.mock.report().calls[0], 'arguments'), false);
  assert.equal(Object.hasOwn(other.mock.report().tools.z, 'lastArguments'), false);
});
test('fixture scenario falls back through match and default; protocol default code', async (t) => {
  const data = { scenarios: { outage: {} }, tools: { z: { default: text('fallback'), match: [{ arguments: { q: 1 }, response: text('matched') }] }, a: { default: { protocolError: { message: 'Internal fixture failure' } } } } };
  const { call } = await setup(t, { scenario: 'outage' }, data);
  assert.deepEqual(await call('z', { q: 1 }), text('matched'));
  assert.deepEqual(await call(), text('fallback'));
  await assert.rejects(call('a', { q: 1 }), (e) => e.code === -32603 && e.message.includes('Internal fixture failure'));
});

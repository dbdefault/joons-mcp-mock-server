import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EmptyResultSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { closeSession, connect, fixture, removeTemp, temp, ticketArgs, within } from './fixtures/interop-helpers.js';

const call = (client, name, args) => client.callTool({ name, arguments: args });
const text = (result) => result.content[0]?.text;
const isCode = (code) => (error) => error instanceof McpError && error.code === code;

test('SDK initialization, listing, results, errors, report and clean close', async () => {
  const dir = await temp();
  const report = join(dir, 'report.json');
  let session;
  try {
    session = await connect([...ticketArgs, '--report', report]);
    const { client } = session;
    assert.match(client.getServerVersion().name, /mock/i);
    assert.match(client.getServerVersion().title, /MOCK/);
    assert.match(client.getInstructions(), /mock/i);
    assert.deepEqual(client.getServerCapabilities(), { tools: { listChanged: false } });
    const snapshot = JSON.parse(await readFile(fixture('tickets.snapshot.json'), 'utf8'));
    const expected = snapshot.tools.map((tool) => Object.fromEntries(Object.entries(tool).filter(([, value]) => value !== null)));
    assert.deepEqual((await client.listTools()).tools, expected);
    assert.equal(text(await call(client, 'create_ticket', { title: 'ordinary', password: 'hide-me', nested: { api_key: 'hidden-too', visible: 'ok' } })), 'Masking fixture matched');
    assert.equal(text(await call(client, 'create_ticket', { title: 'urgent' })), 'Urgent ticket created');
    assert.deepEqual((await call(client, 'search_tickets', { query: 'any' })).structuredContent, { items: ['ticket-1'] });
    assert.equal((await call(client, 'close_ticket', { id: 'T-1' })).isError, true);
    await assert.rejects(call(client, 'get_ticket', { id: 'protocol' }), isCode(-32042));
    await assert.rejects(call(client, 'missing_tool', {}), isCode(-32602));
    const invalid = await call(client, 'create_ticket', {});
    assert.equal(invalid.isError, true);
    assert.match(text(invalid), /Invalid arguments/);
    assert.deepEqual(await client.ping(), {});
    await assert.rejects(client.request({ method: 'custom/unsupported' }, EmptyResultSchema), isCode(-32601));
    await within(client.close());
    assert.deepEqual(await within(session.exited), { code: 0, signal: null });
    const data = JSON.parse(await readFile(report, 'utf8'));
    assert.equal(data.format, 'joons-mcp-mock-server/report');
    assert.equal(data.mock, true);
    assert.equal(data.totals.calls, 7);
    assert.deepEqual(data.totals.byOutcome, { result: 3, is_error: 1, protocol_error: 1, unknown_tool: 1, invalid_arguments: 1 });
    assert.equal(data.calls[0].arguments.password, '[MASKED]');
    assert.equal(data.calls[0].arguments.nested.api_key, '[MASKED]');
    assert.equal(data.calls[0].arguments.nested.visible, 'ok');
    assert.equal(data.tools['<unknown tools>'].calls, 1);
  } finally { if (session) await closeSession(session); await removeTemp(dir); }
});

test('declared fixture scenario and fail-tool precedence', async () => {
  const session = await connect([...ticketArgs, '--scenario', 'outage', '--fail-tool', 'close_ticket']);
  try {
    assert.equal(text(await call(session.client, 'create_ticket', { title: 'urgent' })), 'Ticket service unavailable');
    assert.equal(text(await call(session.client, 'close_ticket', { id: 'T-1' })), 'Mock failure for this tool (--fail-tool)');
  } finally { await closeSession(session); }
});

for (const scenario of ['empty', 'error', 'slow', 'server-error']) {
  test(`built-in scenario ${scenario}`, async () => {
    const session = await connect([...ticketArgs, '--scenario', scenario, '--slow-delay-ms', '100']);
    try {
      if (scenario === 'server-error') await assert.rejects(call(session.client, 'create_ticket', { title: 'ordinary' }), isCode(-32603));
      else {
        const start = performance.now();
        const result = await call(session.client, 'create_ticket', { title: 'ordinary' });
        if (scenario === 'empty') assert.deepEqual(result.content, []);
        if (scenario === 'error') { assert.equal(result.isError, true); assert.equal(text(result), 'Mock error (scenario error)'); }
        if (scenario === 'slow') { assert.equal(text(result), 'Ticket created'); assert.ok(performance.now() - start >= 80); }
      }
    } finally { await closeSession(session); }
  });
}

test('fixture delay respects call timeout', async () => {
  const session = await connect([...ticketArgs, '--call-timeout-ms', '30']);
  try {
    const result = await call(session.client, 'get_ticket', { id: 'T-1' });
    assert.equal(result.isError, true);
    assert.equal(text(result), 'Mock call timed out');
  } finally { await closeSession(session); }
});

test('SIGTERM closes cleanly and writes the report', { skip: process.platform === 'win32' }, async () => {
  const dir = await temp();
  let session;
  try {
    const report = join(dir, 'report.json');
    session = await connect([...ticketArgs, '--report', report]);
    session.child.kill('SIGTERM');
    assert.deepEqual(await within(session.exited), { code: 0, signal: null });
    assert.equal(JSON.parse(await readFile(report, 'utf8')).totals.calls, 0);
  } finally { if (session) await closeSession(session); await removeTemp(dir); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { closeSession, connect, fixture, removeTemp, temp, ticketArgs, within } from './fixtures/interop-helpers.js';

test('five independent clients produce identical results concurrently', async () => {
  const sessions = [];
  try {
    const starts = await Promise.allSettled(Array.from({ length: 5 }, async () => {
      const session = await connect();
      sessions.push(session);
      return session;
    }));
    for (const start of starts) if (start.status === 'rejected') throw start.reason;
    const results = await Promise.all(sessions.map(async ({ client }) => {
      const tools = await client.listTools();
      const result = await client.callTool({ name: 'search_tickets', arguments: { query: 'none' } });
      return { tools, result };
    }));
    for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
    assert.deepEqual(results[0].result.structuredContent, { items: [] });
  } finally { await Promise.all(sessions.map(closeSession)); }
});

test('concurrency limit rejects one overlapping call', async () => {
  const session = await connect([...ticketArgs, '--max-concurrency', '1']);
  try {
    const run = () => session.client.callTool({ name: 'get_ticket', arguments: { id: 'T-1' } });
    const results = await Promise.allSettled([run(), run()]);
    const success = results.filter((result) => result.status === 'fulfilled');
    const failure = results.filter((result) => result.status === 'rejected');
    assert.equal(success.length, 1);
    assert.equal(success[0].value.content[0].text, 'Ticket found');
    assert.equal(failure.length, 1);
    assert.ok(failure[0].reason instanceof McpError);
    assert.equal(failure[0].reason.code, -32000);
  } finally { await closeSession(session); }
});

test('large catalog lists all 2000 tools within 10 seconds', async () => {
  const started = performance.now();
  const session = await connect(['--snapshot', fixture('large.snapshot.json'), '--fixtures', fixture('large.fixtures.json')]);
  try {
    const result = await within(session.client.listTools(), 10000);
    assert.equal(result.tools.length, 2000);
    assert.deepEqual(result.tools.map((tool) => tool.name), Array.from({ length: 2000 }, (_, i) => `tool_${String(i).padStart(4, '0')}`));
    assert.ok(performance.now() - started < 10000);
  } finally { await closeSession(session); }
});

test('storage tripwire is inert and report is the only working-directory file', async () => {
  const dir = await temp();
  let session;
  try {
    assert.deepEqual(await readdir(dir), []);
    const report = join(dir, 'report.json');
    const env = { NODE_OPTIONS: `--require=${JSON.stringify(fixture('network-tripwire.cjs'))}` };
    session = await connect(['--snapshot', fixture('storage.snapshot.json'), '--fixtures', fixture('storage.fixtures.json'), '--report', report], { cwd: dir, env });
    const tools = await session.client.listTools();
    assert.match(tools.tools[0].description, /example\.invalid/);
    const result = await session.client.callTool({ name: 'store_file', arguments: { name: 'document' } });
    assert.match(result.content[0].text, /tripwire-created/);
    assert.deepEqual(await readdir(dir), []);
    await within(session.client.close());
    assert.deepEqual(await within(session.exited), { code: 0, signal: null });
    assert.doesNotMatch(session.stderr(), /INTEROP_TRIPWIRE_ATTEMPT/);
    assert.deepEqual(await readdir(dir), ['report.json']);
    assert.equal(JSON.parse(await readFile(report, 'utf8')).totals.calls, 1);
  } finally { if (session) await closeSession(session); await removeTemp(dir); }
});

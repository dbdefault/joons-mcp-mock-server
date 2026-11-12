import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { open, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bin, fixture, removeTemp, temp, ticketArgs, within } from './fixtures/interop-helpers.js';

test('newline JSON-RPC survives malformed input and exits on stdin close', async () => {
  const child = spawn(process.execPath, [bin, 'start', ...ticketArgs], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const exited = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  const pending = new Map();
  const lines = [];
  let stderr = '';
  let parseFailure;
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const reader = createInterface({ input: child.stdout });
  reader.on('line', (line) => {
    lines.push(line);
    try {
      const message = JSON.parse(line);
      if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    } catch (error) { parseFailure = error; }
  });
  function send(message) { child.stdin.write(`${JSON.stringify(message)}\n`); }
  function request(id, method, params = {}) {
    const reply = new Promise((resolve) => pending.set(id, resolve));
    send({ jsonrpc: '2.0', id, method, params });
    return within(reply);
  }
  try {
    const init = await request(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'raw-client', version: '1.0.0' } });
    assert.equal(init.result.serverInfo.name, 'joons-mcp-mock-server');
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const list = await request(2, 'tools/list');
    assert.deepEqual(list.result.tools.map((tool) => tool.name), ['close_ticket', 'create_ticket', 'get_ticket', 'search_tickets']);
    const result = await request(3, 'tools/call', { name: 'create_ticket', arguments: { title: 'ordinary' } });
    assert.equal(result.result.content[0].text, 'Ticket created');
    child.stdin.write('{ invalid json\n');
    const ping = await request(4, 'ping');
    assert.deepEqual(ping.result, {});
    const unknown = await request(5, 'resources/list');
    assert.equal(unknown.error.code, -32601);
    child.stdin.end();
    assert.deepEqual(await within(exited), { code: 0, signal: null });
    assert.ok(lines.length >= 5);
    assert.equal(parseFailure, undefined);
    for (const line of lines) assert.equal(JSON.parse(line).jsonrpc, '2.0');
    assert.match(stderr, /MOCK MCP server/);
  } finally {
    reader.close();
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await within(exited); }
  }
});

test('malformed, invalid UTF-8 and oversized inputs fail before serving', async () => {
  const dir = await temp();
  const children = new Set();
  async function run(args) {
    const child = spawn(process.execPath, [bin, 'start', ...args], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    children.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    const exited = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
    try {
      const result = await within(exited);
      assert.deepEqual(result, { code: 2, signal: null });
      assert.equal(stdout, '');
      assert.doesNotMatch(stderr, /PRIVATE_FIXTURE_CONTENT/);
      assert.doesNotMatch(stderr, /bad-snapshot\.json/);
    } finally {
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await within(exited); }
      children.delete(child);
    }
  }
  try {
    const malformed = join(dir, 'bad-snapshot.json');
    await writeFile(malformed, '{"PRIVATE_FIXTURE_CONTENT":', 'utf8');
    await run(['--snapshot', malformed]);
    const invalidUtf8 = join(dir, 'bad-utf8.json');
    await writeFile(invalidUtf8, Buffer.from([0xff, 0xfe]));
    await run(['--snapshot', invalidUtf8]);
    const oversized = join(dir, 'oversized.json');
    const file = await open(oversized, 'w');
    try { await file.truncate(64 * 1024 * 1024 + 1); } finally { await file.close(); }
    await run(['--snapshot', oversized]);
    const badFixture = join(dir, 'bad-fixture.json');
    await writeFile(badFixture, '{"format":"joons-mcp-mock-server/fixtures","fixtureVersion":1,"typo":true}', 'utf8');
    await run(['--snapshot', fixture('tickets.snapshot.json'), '--fixtures', badFixture]);
  } finally {
    for (const child of children) child.kill('SIGKILL');
    await removeTemp(dir);
  }
});

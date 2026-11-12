import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { main } from '../src/cli.js';

function harness(cwd = process.cwd()) {
  let out = '', err = '';
  const stdin = new PassThrough();
  const stdout = new Writable({ write(chunk, enc, cb) { out += chunk; cb(); } });
  const stderr = new Writable({ write(chunk, enc, cb) { err += chunk; cb(); } });
  return { io: { stdin, stdout, stderr, env: {}, cwd, signals: new EventEmitter() }, result: () => ({ out, err }) };
}
const snapshot = { format: 'joons-mcp-diff/snapshot', schemaVersion: 1, createdAt: '2026-01-01T00:00:00Z', tool: { name: 'joons-mcp-diff', version: '0.1.0' }, label: null, server: { name: 'test', version: '1', protocolVersion: '2025-11-25' }, tools: [{ name: 'echo', title: null, description: null, inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, annotations: null }], stats: { toolCount: 1, pages: 1 } };
const fixtures = { format: 'joons-mcp-mock-server/fixtures', fixtureVersion: 1, tools: { echo: { default: { content: [] } } } };
async function workspace(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-contract-'));
  try { await fs.writeFile(path.join(dir, 'snapshot.json'), JSON.stringify(snapshot)); await fs.writeFile(path.join(dir, 'fixtures.json'), JSON.stringify(fixtures)); await fn(dir); }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
}
async function run(args, cwd) { const h = harness(cwd); const code = await main(args, h.io); return { code, ...h.result() }; }
async function start(args, cwd) { const h = harness(cwd); const pending = main(args, h.io); setTimeout(() => h.io.stdin.end(), 25); const code = await pending; return { code, ...h.result() }; }

const usage = [
  ['unknown command', ['unknown'], /Choose.*--help/],
  ['missing value', ['start', '--snapshot'], /--snapshot.*provide/i],
  ['duplicate option', ['start', '--snapshot=a', '--snapshot=b'], /Duplicate.*--snapshot.*once/],
  ['missing snapshot start', ['start'], /Missing --snapshot.*provide/i],
  ['missing snapshot validate', ['validate'], /Missing --snapshot.*provide/i],
  ['missing fixtures', ['validate-fixtures'], /Missing --fixtures.*provide/i],
  ['bad format', ['validate', '--snapshot=a', '--format=xml'], /--format.*terminal.*json/],
  ['flag value', ['start', '--snapshot=a', '--quiet=yes'], /--quiet.*omit/i],
  ['argument after terminator', ['start', '--snapshot=a', '--', 'extra'], /Unexpected argument.*--help/]
];
for (const [name, args, message] of usage) test(`usage: ${name}`, async () => { const r = await run(args); assert.equal(r.code, 3); assert.equal(r.out, ''); assert.match(r.err, /^joons-mcp-mock-server: /); assert.match(r.err, message); });
test('unknown option echo is sanitized and limited to 64 characters', async () => { const r = await run(['start', '--snapshot=x', `--bad\u001b\u202e${'z'.repeat(100)}`]); assert.equal(r.code, 3); assert.match(r.err, /Unknown option --badz{61}; use --help/); assert.doesNotMatch(r.err, /[\u001b\u202e]/); });
for (const [name, low, high] of [['slow-delay-ms', 0, 30000], ['call-timeout-ms', 1, 60000], ['max-concurrency', 1, 64]]) {
  for (const value of [low - 1, high + 1, '1.5', 'abc']) test(`usage: ${name} rejects ${value}`, async () => { const r = await run(['start', '--snapshot=x', `--${name}=${value}`]); assert.equal(r.code, 3); assert.match(r.err, new RegExp(`--${name}.*integer.*${low}.*${high}`)); assert.equal(r.out, ''); });
  for (const value of [low, high]) test(`boundary: ${name} accepts ${value}`, async () => workspace(async dir => { const r = await start(['start', '--snapshot=snapshot.json', `--${name}=${value}`, '--quiet', '--'], dir); assert.equal(r.code, 0); assert.equal(r.out, ''); }));
}
test('unknown scenario is configuration error before serving', async () => workspace(async dir => { const r = await run(['start', '--snapshot=snapshot.json', '--scenario=unknown'], dir); assert.equal(r.code, 2); assert.equal(r.out, ''); assert.match(r.err, /Unknown scenario.*choose/i); }));
for (const kind of ['snapshot', 'fixtures', 'cross-check']) test(`start rejects invalid ${kind} without leaking paths`, async () => workspace(async dir => {
  if (kind === 'snapshot') await fs.writeFile(path.join(dir, 'snapshot.json'), '{}');
  if (kind === 'fixtures') await fs.writeFile(path.join(dir, 'fixtures.json'), '{}');
  if (kind === 'cross-check') await fs.writeFile(path.join(dir, 'fixtures.json'), JSON.stringify({ ...fixtures, tools: { absent: { default: { content: [] } } } }));
  const r = await run(['start', '--snapshot', path.join(dir, 'snapshot.json'), '--fixtures', path.join(dir, 'fixtures.json')], dir);
  assert.equal(r.code, 2); assert.equal(r.out, ''); assert.ok(!r.err.includes(dir)); assert.match(r.err, /^joons-mcp-mock-server: /);
}));
test('banner matches exactly and quiet suppresses it', async () => workspace(async dir => {
  const args = ['start', '--snapshot=snapshot.json']; const r = await start(args, dir);
  assert.equal(r.code, 0); assert.equal(r.err.split('\n')[0], 'MOCK MCP server (joons-mcp-mock-server 0.1.0): 1 tools, scenario default. Responses come from fixtures; no real actions are performed.');
  const quiet = await start([...args, '--quiet'], dir); assert.equal(quiet.code, 0); assert.equal(quiet.err, '');
}));
for (const command of ['validate', 'validate-fixtures']) for (const format of ['terminal', 'json']) test(`${command} ${format} valid output and warnings`, async () => workspace(async dir => {
  const args = command === 'validate' ? ['validate', '--snapshot=snapshot.json'] : ['validate-fixtures', '--snapshot=snapshot.json', '--fixtures=fixtures.json'];
  const r = await run([...args, `--format=${format}`], dir); assert.equal(r.code, 0); assert.ok(!r.err.includes(dir));
  if (format === 'json') { const value = JSON.parse(r.out); assert.deepEqual(Object.keys(value), ['format', 'schemaVersion', 'ok', 'errors', 'warnings']); assert.equal(value.format, 'joons-mcp-mock-server/validation'); assert.equal(value.schemaVersion, 1); assert.equal(value.ok, true); assert.deepEqual(value.errors, []); assert.equal(value.warnings.length, command === 'validate' ? 0 : 1); assert.equal(r.err, ''); }
  else { assert.equal(r.out, 'Valid\n'); if (command === 'validate-fixtures') assert.match(r.err, /standard MCP clients reject/i); else assert.equal(r.err, ''); }
}));
for (const command of ['validate', 'validate-fixtures']) test(`${command} invalid JSON result shape`, async () => workspace(async dir => {
  const name = command === 'validate' ? '--snapshot=bad.json' : '--fixtures=bad.json'; await fs.writeFile(path.join(dir, 'bad.json'), '{}');
  const r = await run([command, name, '--format=json'], dir); assert.equal(r.code, 2); const result = JSON.parse(r.out); assert.deepEqual(Object.keys(result), ['format', 'schemaVersion', 'ok', 'errors', 'warnings']); assert.equal(result.ok, false); assert.ok(result.errors.length); assert.deepEqual(result.warnings, []); assert.ok(!r.out.includes(dir));
}));
test('report rename failure at directory leaves no temporary or partial file', async () => workspace(async dir => {
  await fs.mkdir(path.join(dir, 'destination')); const r = await start(['start', '--snapshot=snapshot.json', '--report=destination'], dir);
  assert.equal(r.code, 4); assert.match(r.err, /Could not write report/); assert.ok(!r.err.includes(dir)); assert.deepEqual(await fs.readdir(path.join(dir, 'destination')), []); assert.deepEqual((await fs.readdir(dir)).sort(), ['destination', 'fixtures.json', 'snapshot.json']);
}));
test('report is written to a sibling temporary file before rename', async () => workspace(async dir => {
  const target = path.join(dir, 'report.json');
  const originalRename = fs.rename; let observed = false;
  fs.rename = async (from, to) => {
    if (to === target) {
      assert.equal(path.dirname(from), dir); assert.notEqual(from, target);
      assert.equal(JSON.parse(await fs.readFile(from, 'utf8')).format, 'joons-mcp-mock-server/report');
      await assert.rejects(fs.stat(target), { code: 'ENOENT' }); observed = true;
    }
    return originalRename(from, to);
  };
  try { const r = await start(['start', '--snapshot=snapshot.json', '--report=report.json'], dir); assert.equal(r.code, 0); assert.equal(observed, true); assert.equal(JSON.parse(await fs.readFile(target, 'utf8')).mock, true); assert.ok(!(await fs.readdir(dir)).some(name => name.endsWith('.tmp'))); }
  finally { fs.rename = originalRename; }
}));
test('help includes all commands, options, defaults and exit codes; version is exact', async () => {
  const h = await run(['--help']); assert.equal(h.code, 0);
  for (const word of ['start', 'validate', 'validate-fixtures', '--snapshot', '--fixtures', '--scenario', '--fail-tool', '--slow-delay-ms', '--call-timeout-ms', '--max-concurrency', '--no-validate-arguments', '--mark-descriptions', '--report', '--mask-key', '--no-record-arguments', '--quiet', '--format', '--help', '--version', 'default', '2000', '30000', '8', 'terminal', '0 success', '2 invalid', '3 usage', '4 report']) assert.ok(h.out.includes(word), word);
  const v = await run(['--version']); assert.equal(v.code, 0); assert.equal(v.out, '0.1.0\n'); assert.equal(v.err, '');
});
test('bin ignores asynchronous stderr EPIPE', async () => {
  const script = `process.stderr.destroy(Object.assign(new Error('closed'),{code:'EPIPE'})); process.argv=['node','bin','bad']; await import('./bin/joons-mcp-mock-server.js');`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let err = ''; child.stderr.on('data', c => { err += c; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert.equal(code, 3); assert.doesNotMatch(err, /Unhandled|uncaught|EPIPE/);
});

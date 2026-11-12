import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseArgs } from './args.js';
import { VERSION, BUILTIN_SCENARIOS } from './version.js';
import { readJsonFile } from './input/read.js';
import { validateSnapshot } from './input/snapshot.js';
import { validateFixtures } from './input/fixtures.js';
import { createMockServer } from './server/runtime.js';

const HELP = `joons-mcp-mock-server ${VERSION}
Usage:
  start --snapshot FILE [--fixtures FILE] [--scenario NAME] [--fail-tool NAME]... [--slow-delay-ms N] [--call-timeout-ms N] [--max-concurrency N] [--no-validate-arguments] [--mark-descriptions] [--report FILE] [--mask-key NAME]... [--no-record-arguments] [--quiet]
  validate --snapshot FILE [--format terminal|json]
  validate-fixtures --fixtures FILE [--snapshot FILE] [--format terminal|json]
  --help | --version
Defaults: no fixtures; scenario default; no fail-tool entries; slow-delay-ms 2000; call-timeout-ms 30000; max-concurrency 8; argument validation enabled; descriptions unmarked; no report; no extra mask-key entries; argument recording enabled; not quiet; format terminal.
Exit codes: 0 success; 2 invalid input or configuration; 3 usage error; 4 report write failure.
`;
const sanitize = value => String(value).replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]/g, '').slice(0, 200);
function write(stream, message) { try { if (!stream.destroyed) stream.write(message); } catch {} }
function diagnostics(items) { return (items || []).map(item => typeof item === 'string' ? sanitize(item) : `${sanitize(item.path || '/')} : ${sanitize(item.message || 'Invalid input')}`); }
async function load(file, label, limit, cwd) {
  try { return { value: await readJsonFile(path.resolve(cwd, file), { maxBytes: limit }) }; }
  catch (error) { const kinds = ['file_not_found', 'file_too_large', 'read_failed', 'json_parse', 'depth_exceeded', 'limit_exceeded']; return { error: `${label}: ${kinds.includes(error?.kind) ? error.kind : 'read_failed'}.` }; }
}
async function atomicReport(file, report, cwd) {
  const target = path.resolve(cwd, file);
  const temp = path.join(path.dirname(target), `.joons-mock-${randomBytes(12).toString('hex')}.tmp`);
  try { await fs.writeFile(temp, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', encoding: 'utf8' }); await fs.rename(temp, target); }
  finally { await fs.unlink(temp).catch(() => {}); }
}
export async function main(argv, io) {
  const { stdin, stdout, stderr } = io;
  const cwd = io.cwd || process.cwd();
  let parsed;
  try { parsed = parseArgs(argv); } catch (error) { write(stderr, `joons-mcp-mock-server: ${sanitize(error.message)}\n`); return 3; }
  const { command, options: o } = parsed;
  if (command === 'help') { write(stdout, HELP); return 0; }
  if (command === 'version') { write(stdout, `${VERSION}\n`); return 0; }
  let snapshot, fixtures;
  const errors = [], warnings = [];
  if (o.snapshot) {
    const result = await load(o.snapshot, 'snapshot file', 64 * 1024 * 1024, cwd);
    if (result.error) errors.push(result.error); else { snapshot = result.value; const checked = validateSnapshot(snapshot); errors.push(...diagnostics(checked.errors)); }
  }
  if (o.fixtures) {
    const result = await load(o.fixtures, 'fixture file', 16 * 1024 * 1024, cwd);
    if (result.error) errors.push(result.error); else { const checked = validateFixtures(result.value, { snapshot: errors.length ? undefined : snapshot }); errors.push(...diagnostics(checked.errors)); warnings.push(...diagnostics(checked.warnings)); fixtures = checked.fixtures; }
  }
  const scenario = o.scenario ?? 'default';
  if (command === 'start' && !BUILTIN_SCENARIOS.includes(scenario) && !(fixtures && Object.hasOwn(fixtures.scenarios || {}, scenario))) errors.push('Unknown scenario; choose a built-in or declared fixture scenario.');
  if (command !== 'start') {
    const result = { format: 'joons-mcp-mock-server/validation', schemaVersion: 1, ok: errors.length === 0, errors, warnings };
    if (o.format === 'json') write(stdout, `${JSON.stringify(result)}\n`);
    else { write(stdout, `${result.ok ? 'Valid' : 'Invalid'}\n`); for (const item of [...errors, ...warnings]) write(stderr, `joons-mcp-mock-server: ${item}\n`); }
    return result.ok ? 0 : 2;
  }
  if (errors.length) { for (const item of errors) write(stderr, `joons-mcp-mock-server: ${item}\n`); return 2; }
  const mock = createMockServer({ snapshot, fixtures, options: { scenario, failTools: o['fail-tool'] || [], slowDelayMs: Number(o['slow-delay-ms'] ?? 2000), callTimeoutMs: Number(o['call-timeout-ms'] ?? 30000), maxConcurrency: Number(o['max-concurrency'] ?? 8), validateArguments: !o['no-validate-arguments'], markDescriptions: !!o['mark-descriptions'], maskKeys: o['mask-key'] || [], recordArguments: !o['no-record-arguments'] } });
  const transport = new StdioServerTransport(stdin, stdout);
  let stop;
  const stopped = new Promise(resolve => { stop = resolve; });
  const listeners = [];
  function listen(emitter, event, fn) { if (emitter?.on) { emitter.on(event, fn); listeners.push(() => emitter.removeListener(event, fn)); } }
  listen(stdin, 'end', stop); listen(stdin, 'close', stop); listen(stdout, 'close', stop); listen(stdout, 'error', stop);
  listen(io.signals, 'SIGINT', stop); listen(io.signals, 'SIGTERM', stop);
  const previousClose = transport.onclose;
  transport.onclose = () => { previousClose?.(); stop(); };
  if (!o.quiet) write(stderr, `MOCK MCP server (joons-mcp-mock-server ${VERSION}): ${snapshot.tools.length} tools, scenario ${sanitize(scenario)}. Responses come from fixtures; no real actions are performed.\n`);
  try { await mock.connect(transport); if (stdin.readableEnded || stdin.destroyed || stdout.destroyed) stop(); await stopped; }
  catch { write(stderr, 'joons-mcp-mock-server: Server connection failed.\n'); return 2; }
  finally { for (const remove of listeners) remove(); await mock.close().catch(() => {}); }
  let status = 0;
  if (o.report) try { await atomicReport(o.report, mock.report(), cwd); } catch { status = 4; write(stderr, 'joons-mcp-mock-server: Could not write report; check the destination.\n'); }
  if (!o.quiet) write(stderr, 'MOCK MCP server stopped.\n');
  return status;
}

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const fixture = (name) => join(here, name);
export const bin = resolve(here, '../../bin/joons-mcp-mock-server.js');
export const ticketArgs = ['--snapshot', fixture('tickets.snapshot.json'), '--fixtures', fixture('tickets.fixtures.json')];
export const temp = () => mkdtemp(join(tmpdir(), 'mock-interop-'));
export const removeTemp = (dir) => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

export async function connect(args = ticketArgs, options = {}) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [bin, 'start', ...args], cwd: options.cwd, env: options.env, stderr: 'pipe' });
  let stderr = '';
  transport.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const client = new Client({ name: 'interop-test', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
  } catch (error) {
    await transport.close();
    throw new Error(`Connection failed: ${error.message}; stderr: ${stderr}`);
  }
  const child = transport._process;
  const exited = new Promise((resolveExit) => {
    if (child.exitCode !== null || child.signalCode !== null) resolveExit({ code: child.exitCode, signal: child.signalCode });
    else child.once('close', (code, signal) => resolveExit({ code, signal }));
  });
  return { client, transport, child, exited, stderr: () => stderr };
}

export async function within(promise, ms = 5000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms); })]);
  } finally { clearTimeout(timer); }
}

export async function closeSession(session) {
  try { await within(session.client.close()); }
  finally {
    if (session.child.exitCode === null && session.child.signalCode === null) {
      session.child.kill('SIGKILL');
      await within(session.exited);
    }
  }
}

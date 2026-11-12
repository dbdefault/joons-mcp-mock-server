#!/usr/bin/env node
import { main } from '../src/cli.js';
process.stderr.on('error', () => {});
process.stdout.on('error', () => {});
try {
  process.exitCode = await main(process.argv.slice(2), { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr, env: process.env, cwd: process.cwd(), signals: process });
} catch {
  process.exitCode = 2;
  try { process.stderr.write('joons-mcp-mock-server: Unexpected error.\n'); } catch {}
}

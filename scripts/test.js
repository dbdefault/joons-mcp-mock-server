import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(root, 'tests');
let files = [];
try { files = readdirSync(dir).filter(name => name.endsWith('.test.js')).sort().map(name => path.join(dir, name)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', windowsHide: true });
process.exitCode = result.status ?? 1;

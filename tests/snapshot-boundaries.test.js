import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateSnapshot } from '../src/input/snapshot.js';
const original = JSON.parse(await readFile(new URL('./fixtures/diff-example.json', import.meta.url), 'utf8'));
for (const [name, mutate, path] of [
  ['format', v => { v.format = 'wrong'; }, '/format'],
  ['version', v => { v.schemaVersion = 2; }, '/schemaVersion'],
  ['name length', v => { v.tools[0].name = 'x'.repeat(1001); }, '/tools/0/name'],
  ['missing input type', v => { v.tools[0].inputSchema = {}; }, '/tools/0/inputSchema'],
  ['array input type', v => { v.tools[0].inputSchema = { type: 'array' }; }, '/tools/0/inputSchema'],
  ['output type', v => { v.tools[0].outputSchema = {}; }, '/tools/0/outputSchema'],
  ['count mismatch', v => { v.stats.toolCount++; }, '/stats/toolCount'],
  ['tool limit', v => { v.tools = Array.from({ length: 10001 }, (_, i) => ({ ...v.tools[0], name: String(i) })); v.stats.toolCount = v.tools.length; }, '/tools']
]) test('snapshot rejects ' + name, () => { const v = structuredClone(original); mutate(v); assert(validateSnapshot(v).errors.some(e => e.path === path)); });

test('snapshot rejects every forbidden name control without echoing the name', () => {
  const forbidden = [...Array.from({ length: 32 }, (_, i) => i), 0x7f, ...Array.from({ length: 32 }, (_, i) => 0x80 + i), 0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069];
  for (const code of forbidden) {
    const v = structuredClone(original); v.tools[0].name = 'secret' + String.fromCharCode(code);
    const error = validateSnapshot(v).errors.find(e => e.path === '/tools/0/name');
    assert(error, `control U+${code.toString(16)} accepted`);
    assert.equal(error.message, 'invalid tool name');
  }
});
test('snapshot accepts ordinary names including unicode letters', () => {
  for (const name of ['simple', 'dots.and-dashes', '\uac80\uc0c9-\u00e9']) {
    const v = structuredClone(original); v.tools[0].name = name;
    assert.equal(validateSnapshot(v).ok, true);
  }
});

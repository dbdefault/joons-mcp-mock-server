import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateSnapshot } from '../src/input/snapshot.js';

const snapshot = JSON.parse(await readFile(new URL('./fixtures/diff-example.json', import.meta.url), 'utf8'));
test('real snapshot validates', () => assert.equal(validateSnapshot(snapshot).ok, true));
test('invalid input schema and duplicate names are rejected', () => {
  const v = structuredClone(snapshot);
  v.tools[0].inputSchema.type = 'string';
  v.tools.push(structuredClone(v.tools[0])); v.stats.toolCount++;
  const result = validateSnapshot(v);
  assert.equal(result.ok, false);
  assert(result.errors.some(e => e.path === '/tools/0/inputSchema'));
  assert(result.errors.some(e => e.message === 'duplicate tool name'));
});

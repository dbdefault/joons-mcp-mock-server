import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonText } from '../src/input/read.js';
import { safePathSegment } from '../src/util/object.js';

test('BOM and hostile keys remain data', () => {
  const v = parseJsonText('\ufeff{"__proto__":{"x":1}}');
  assert.equal(Object.hasOwn(v, '__proto__'), true);
  assert.equal({}.x, undefined);
  assert.equal(safePathSegment('a/b', 2), '<unknown key #2>');
});
test('deep input is rejected without recursive overflow', () => {
  assert.throws(() => parseJsonText('['.repeat(100000) + '0' + ']'.repeat(100000)), { kind: 'depth_exceeded' });
});
test('depth and node boundaries', () => {
  assert.deepEqual(parseJsonText('[0]', { maxDepth: 1, maxNodes: 2 }), [0]);
  assert.throws(() => parseJsonText('[0]', { maxDepth: 0 }), { kind: 'depth_exceeded' });
  assert.throws(() => parseJsonText('[0]', { maxNodes: 1 }), { kind: 'limit_exceeded' });
});
test('malformed JSON reports location without contents', () => {
  assert.throws(() => parseJsonText('{\n"secret": }'), e => e.kind === 'json_parse' && /2:\d+/.test(e.message) && !e.message.includes('secret'));
});

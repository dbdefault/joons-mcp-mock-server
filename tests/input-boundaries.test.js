import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJsonFile, parseJsonText } from '../src/input/read.js';
import { safePathSegment } from '../src/util/object.js';

test('file errors are classified without disclosing paths', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'mock-input-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const [path, options, kind] of [[join(dir, 'absent-secret'), {}, 'file_not_found'], [dir, {}, 'read_failed']]) {
    await assert.rejects(readJsonFile(path, options), e => e.kind === kind && !e.message.includes(path));
  }
});
test('file byte limit accepts equality and rejects excess', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'mock-input-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'data'); await writeFile(path, '{}');
  assert.deepEqual(await readJsonFile(path, { maxBytes: 2 }), {});
  await assert.rejects(readJsonFile(path, { maxBytes: 1 }), { kind: 'file_too_large' });
});
for (const [label, bytes] of [['invalid UTF-8', [0xff]], ['overlong UTF-8', [0xc0, 0x80]], ['double BOM', [0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf, 0x7b, 0x7d]]]) test(label + ' is rejected', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'mock-input-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'data'); await writeFile(path, Buffer.from(bytes));
  await assert.rejects(readJsonFile(path), { kind: 'json_parse' });
});
test('CRLF parse position is reported without content', () => assert.throws(() => parseJsonText('{\r\n  "secret": }'), e => e.kind === 'json_parse' && e.message.includes('2:14') && !e.message.includes('secret')));
for (const [label, make] of [['arrays', n => '['.repeat(n) + '0' + ']'.repeat(n)], ['objects', n => '{"a":'.repeat(n) + '0' + '}'.repeat(n)]]) test(label + ' depth boundary', () => {
  assert.doesNotThrow(() => parseJsonText(make(64)));
  assert.throws(() => parseJsonText(make(65)), { kind: 'depth_exceeded' });
});
for (const [label, maxBytes, limit] of [['snapshot', 64 * 1024 * 1024, 100000], ['fixture', 16 * 1024 * 1024, 1000000]]) for (const kind of ['string', 'key']) test(`${label} ${kind} length boundary`, () => {
  const json = n => kind === 'string' ? JSON.stringify('x'.repeat(n)) : JSON.stringify({ ['x'.repeat(n)]: 0 });
  assert.doesNotThrow(() => parseJsonText(json(limit), { maxBytes }));
  assert.throws(() => parseJsonText(json(limit + 1), { maxBytes }), { kind: 'limit_exceeded' });
});
test('unsafe path segments are replaced with their own-key positions', () => {
  for (const [i, key] of ['a/b', '\x1b[31m', 'a\nb', 'x'.repeat(65)].entries()) assert.equal(safePathSegment(key, i + 1), `<unknown key #${i + 1}>`);
  assert.equal(safePathSegment('safe-$._9', 1), 'safe-$._9');
});

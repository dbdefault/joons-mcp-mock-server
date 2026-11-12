import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripControls } from '../src/util/object.js';

test('strips ANSI CSI and OSC hyperlinks terminated by BEL or ST', () => {
  const text = 'a\x1b[31mred\x1b[0m \x1b]8;;https://example.invalid\x07link\x1b]8;;\x07 \x1b]8;;uri\x1b\\other\x1b]8;;\x1b\\z';
  assert.equal(stripControls(text), 'ared link otherz');
});
test('strips all specified controls and preserves tab and newline only when requested', () => {
  const controls = Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)).join('') + '\x7f' + Array.from({ length: 32 }, (_, i) => String.fromCharCode(0x80 + i)).join('') + '\u061c\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069';
  assert.equal(stripControls('a' + controls + 'b'), 'ab');
  assert.equal(stripControls('a\t\nb\r\u202ec\x9f', { keepNewlines: true }), 'a\t\nbc');
  assert.equal(stripControls('a\t\nb', { keepNewlines: false }), 'ab');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArguments } from '../src/schema/arguments.js';
test('integer differs from number and type arrays work', () => {
  assert(validateArguments({ type: 'number' }, 1.5).ok); assert(!validateArguments({ type: 'integer' }, 1.5).ok);
  assert(validateArguments({ type: ['integer', 'string'] }, 'x').ok); assert(!validateArguments({ type: ['integer', 'string'] }, false).ok);
});
test('length uses Unicode code points', () => {
  assert(validateArguments({ minLength: 1, maxLength: 1 }, '\ud83d\ude00').ok);
  assert(!validateArguments({ minLength: 2 }, '\ud83d\ude00').ok); assert(!validateArguments({ maxLength: 0 }, '\ud83d\ude00').ok);
});
test('enum and const compare nested objects', () => {
  for (const schema of [{ enum: [{ a: [1] }] }, { const: { a: [1] } }]) { assert(validateArguments(schema, { a: [1] }).ok); assert(!validateArguments(schema, { a: [2] }).ok); }
});
test('nested array items report pointer paths', () => {
  const r = validateArguments({ properties: { a: { items: { items: { type: 'integer' } } } } }, { a: [[0, 'value']] });
  assert.equal(r.errors[0].path, '/a/0/1'); assert(!JSON.stringify(r.errors).includes('value'));
});
test('ignored keywords and undefined arguments', () => {
  assert(validateArguments({ pattern: '^x$', oneOf: [{ type: 'number' }], $ref: '#/bad' }, 'bad').ok);
  assert(validateArguments({ type: 'object', additionalProperties: false }, undefined).ok);
});
test('unsafe property paths and prototype keys are handled safely', () => {
  const args = JSON.parse('{"__proto__":1,"a/b":2,"\\u001b[31m":3,"line\\nkey":4}');
  const r = validateArguments({ additionalProperties: false }, args);
  assert(r.errors.some(e => e.path === '/__proto__')); assert(r.errors.some(e => e.path === '/<unknown key #2>'));
  assert(r.errors.some(e => e.path === '/<unknown key #3>')); assert(r.errors.some(e => e.path === '/<unknown key #4>')); assert.equal({}.polluted, undefined);
});

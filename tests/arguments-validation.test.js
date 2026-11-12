import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArguments } from '../src/schema/arguments.js';
test('keywords accept valid arguments and reject invalid arguments', () => {
  const cases = [
    [{ type: 'integer' }, 1, 1.5], [{ enum: [{ x: 1 }] }, { x: 1 }, { x: 2 }],
    [{ const: [1] }, [1], [2]], [{ required: ['x'] }, { x: 1 }, {}],
    [{ properties: { x: { type: 'string' } } }, { x: 'a' }, { x: 1 }],
    [{ additionalProperties: false }, {}, { x: 1 }], [{ additionalProperties: { type: 'string' } }, { x: 'a' }, { x: 1 }],
    [{ items: { type: 'integer' } }, [1], [1.1]], [{ minItems: 1 }, [1], []], [{ maxItems: 1 }, [1], [1, 2]],
    [{ minLength: 1 }, '\ud83d\ude00', ''], [{ maxLength: 1 }, '\ud83d\ude00', 'ab'],
    [{ minimum: 1 }, 1, 0], [{ maximum: 1 }, 1, 2], [{ exclusiveMinimum: 1 }, 2, 1], [{ exclusiveMaximum: 1 }, 0, 1]
  ];
  for (const [schema, good, bad] of cases) { assert.equal(validateArguments(schema, good).ok, true); assert.equal(validateArguments(schema, bad).ok, false); }
});
test('unknown keywords are ignored and errors are capped', () => {
  assert.equal(validateArguments({ pattern: '^x$', format: 'email' }, 'no').ok, true);
  assert.equal(validateArguments({ required: Array.from({ length: 20 }, (_, i) => String(i)) }, {}).errors.length, 10);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFixtures } from '../src/input/fixtures.js';
const make = () => ({ format: 'joons-mcp-mock-server/fixtures', fixtureVersion: 1, tools: { echo: { default: { content: [{ type: 'text', text: 'ok' }] } } } });
for (const [name, change] of [
  ['top level', v => { v.typo = 1; }],
  ['tool entry', v => { v.tools.echo.typo = 1; }],
  ['response', v => { v.tools.echo.default.typo = 1; }],
  ['block', v => { v.tools.echo.default.content[0].typo = 1; }],
  ['match entry', v => { v.tools.echo.match = [{ arguments: {}, response: { content: [] }, typo: 1 }]; }],
  ['protocol error', v => { v.tools.echo.default = { protocolError: { message: 'x', typo: 1 } }; }]
]) test('unknown ' + name + ' key is rejected', () => { const v = make(); change(v); assert(validateFixtures(v).errors.some(e => e.message === 'unknown key')); });
for (const key of ['__proto__', 'constructor']) test('reserved ' + key + ' is rejected outside payload', () => {
  const v = make(); v.tools.echo.match = [{ arguments: JSON.parse(`{"nested":{"${key}":1}}`), response: { content: [] } }];
  assert(validateFixtures(v).errors.some(e => e.message === 'reserved key'));
});
test('reserved structured payload keys are copied as data', () => {
  const v = make(); v.tools.echo.default.structuredContent = JSON.parse('{"__proto__":{"polluted":true},"constructor":1}');
  const r = validateFixtures(v); assert(r.ok); assert(Object.hasOwn(r.fixtures.tools.echo.default.structuredContent, '__proto__')); assert.equal({}.polluted, undefined);
  v.tools.echo.default.structuredContent.constructor = 2; assert.equal(r.fixtures.tools.echo.default.structuredContent.constructor, 1);
  assert(Object.isFrozen(r.fixtures.tools.echo.default.structuredContent.__proto__));
});
for (const [name, change] of [
  ['scenario pattern', v => { v.scenarios = { Bad: {} }; }],
  ['built-in scenario', v => { v.scenarios = { empty: {} }; }],
  ['undeclared scenario', v => { v.tools.echo.scenarios = { missing: { content: [] } }; }],
  ['empty entry', v => { v.tools.echo = {}; }],
  ['block count', v => { v.tools.echo.default.content = Array.from({ length: 101 }, () => ({ type: 'text', text: '' })); }],
  ['block type', v => { v.tools.echo.default.content = [{ type: 'resource' }]; }],
  ['base64', v => { v.tools.echo.default.content = [{ type: 'image', data: '***', mimeType: 'image/png' }]; }],
  ['delay', v => { v.tools.echo.default.delayMs = 30001; }],
  ['reserved protocol code', v => { v.tools.echo.default = { protocolError: { code: -32700, message: 'x' } }; }]
]) test('fixture rejects ' + name, () => { const v = make(); change(v); assert.equal(validateFixtures(v).ok, false); });
test('internal protocol error code and default code are accepted', () => {
  const v = make(); v.tools.echo.default = { protocolError: { code: -32603, message: 'x' } }; assert(validateFixtures(v).ok);
  delete v.tools.echo.default.protocolError.code; assert.equal(validateFixtures(v).fixtures.tools.echo.default.protocolError.code, -32603);
});
test('serialized response size boundary', () => {
  const v = make(), r = v.tools.echo.default;
  const overhead = Buffer.byteLength(JSON.stringify(r)) - r.content[0].text.length;
  r.content[0].text = 'x'.repeat(4 * 1024 * 1024 - overhead);
  assert(validateFixtures(v).ok);
  r.content[0].text += 'x'; assert.equal(validateFixtures(v).ok, false);
});
test('snapshot cross-check rejects unknown tool', () => assert(validateFixtures(make(), { snapshot: { tools: [] } }).errors.some(e => e.message === 'tool not in snapshot')));
test('match arguments and responses are independent and deeply frozen', () => {
  const v = make(); v.tools.echo.match = [{ arguments: { x: { y: 1 } }, response: { content: [{ type: 'text', text: 'a' }] } }];
  const r = validateFixtures(v); assert(r.ok); v.tools.echo.match[0].arguments.x.y = 2; v.tools.echo.match[0].response.content[0].text = 'b';
  assert.equal(r.fixtures.tools.echo.match[0].arguments.x.y, 1); assert.equal(r.fixtures.tools.echo.match[0].response.content[0].text, 'a');
  assert(Object.isFrozen(r.fixtures.tools.echo.match[0].arguments.x));
});

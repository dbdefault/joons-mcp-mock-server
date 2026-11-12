import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFixtures } from '../src/input/fixtures.js';
const fixture = () => ({ format: 'joons-mcp-mock-server/fixtures', fixtureVersion: 1, tools: { echo: { default: { content: [{ type: 'text', text: 'ok' }] } } } });
test('fixtures are copied, normalized and deeply frozen', () => {
  const input = fixture(), result = validateFixtures(input);
  assert.equal(result.ok, true); assert.equal(result.fixtures.missingFixture, 'error');
  assert(Object.isFrozen(result.fixtures.tools.echo.default.content[0]));
  input.tools.echo.default.content[0].text = 'changed';
  assert.equal(result.fixtures.tools.echo.default.content[0].text, 'ok');
});
test('typos, undeclared scenarios and reserved keys fail', () => {
  const v = fixture(); v.tools.echo.defaut = {}; v.tools.echo.scenarios = { outage: { content: [] } };
  Object.defineProperty(v.tools, '__proto__', { value: {}, enumerable: true });
  const r = validateFixtures(v); assert.equal(r.ok, false);
  assert(r.errors.some(e => e.message === 'unknown key'));
  assert(r.errors.some(e => e.message === 'scenario not declared'));
  assert(r.errors.some(e => e.message === 'reserved key'));
});
test('output schema warning is emitted', () => {
  const r = validateFixtures(fixture(), { snapshot: { tools: [{ name: 'echo', outputSchema: { type: 'object' } }] } });
  assert.equal(r.ok, true); assert.equal(r.warnings.length, 1);
});

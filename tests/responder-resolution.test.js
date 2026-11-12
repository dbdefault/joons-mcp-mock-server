import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveResponse } from '../src/server/responder.js';
test('matches own keys only, first match wins, fixture payload remains data', () => {
  const payload = JSON.parse('{"content":[],"structuredContent":{"__proto__":{"safe":true}}}');
  const fixtures = { tools: { z: { match: [{ arguments: { toString: 1 }, response: { content: [] } }, { arguments: {}, response: payload }, { arguments: {}, response: { content: [], isError: true } }] } } };
  const result = resolveResponse({ name: 'z', fixtures, args: {} });
  assert.equal(result.source, 'fixture_match');
  assert.deepEqual(result.response, payload);
  result.response.structuredContent.__proto__.safe = false;
  assert.equal(payload.structuredContent.__proto__.safe, true);
});

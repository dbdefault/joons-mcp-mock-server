import { isDeepStrictEqual } from 'node:util';

export const BUILTIN_SCENARIOS = Object.freeze(['default', 'empty', 'error', 'slow', 'server-error']);
export const errorResult = (text) => ({ content: [{ type: 'text', text }], isError: true });
export const copy = (value) => structuredClone(value);
export const sanitize = (value, length) => String(value).replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]/g, '').slice(0, length);
// Human-facing protocol metadata keeps newline and tab; fixture results stay literal.
export const sanitizeDisplay = (value, length) => String(value).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]/g, '').slice(0, length);

// Pure resolution; validation, concurrency, and scheduling belong to runtime.
export function resolveResponse({ name, args = {}, fixtures = null, options = {} }) {
  const scenario = options.scenario ?? 'default';
  if (scenario === 'server-error') return { response: { protocolError: { code: -32603, message: 'Mock server error (scenario server-error)' } }, source: 'builtin_scenario' };
  if (scenario === 'error') return { response: errorResult('Mock error (scenario error)'), source: 'builtin_scenario' };
  if (scenario === 'empty') return { response: { content: [] }, source: 'builtin_scenario' };
  if (new Set(options.failTools ?? []).has(name)) return { response: errorResult('Mock failure for this tool (--fail-tool)'), source: 'fail_tool' };
  const entry = fixtures?.tools && Object.hasOwn(fixtures.tools, name) ? fixtures.tools[name] : null;
  if (entry?.scenarios && Object.hasOwn(entry.scenarios, scenario)) return { response: copy(entry.scenarios[scenario]), source: 'fixture_scenario' };
  for (const match of entry?.match ?? []) {
    if (Object.keys(match.arguments).every((key) => Object.hasOwn(args, key) && isDeepStrictEqual(args[key], match.arguments[key]))) return { response: copy(match.response), source: 'fixture_match' };
  }
  if (entry && Object.hasOwn(entry, 'default')) return { response: copy(entry.default), source: 'fixture_default' };
  return { response: fixtures?.missingFixture === 'empty' ? { content: [] } : errorResult('No mock fixture for this tool'), source: 'missing_fixture' };
}

import { copy, sanitize } from './responder.js';

const SECRET_KEYS = 'password passwd secret token apikey api_key api-key authorization auth credential cookie session privatekey private_key'.split(' ');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function createRecorder({ snapshot, options = {} }) {
  const secrets = new Set(SECRET_KEYS);
  const custom = new Set(options.maskKeys ?? []);
  const calls = [];
  const tools = new Map();
  const outcomes = new Map();
  let count = 0;
  let lastCall;
  function mask(value, depth = 0) {
    if (depth > 16) return '[TRUNCATED]';
    if (typeof value === 'string') return value.slice(0, 1000);
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item) => mask(item, depth + 1));
    return Object.fromEntries(Object.keys(value).map((key) => [key,
      secrets.has(key.toLowerCase()) || custom.has(key) ? '[MASKED]' : mask(value[key], depth + 1)]));
  }
  function record({ name, args = {}, outcome, source, unknown = false }) {
    const tool = unknown ? sanitize(name, 100) : name;
    const entry = { seq: ++count, tool, outcome, source };
    if (options.recordArguments !== false) entry.arguments = mask(args);
    const key = unknown ? '<unknown tools>' : name;
    const stats = tools.get(key) ?? { calls: 0 };
    stats.calls++;
    if (options.recordArguments !== false) stats.lastArguments = copy(entry.arguments);
    tools.set(key, stats);
    outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
    if (calls.length < 1000) calls.push(entry);
    lastCall = { seq: entry.seq, tool, outcome };
    if (options.recordArguments !== false) lastCall.arguments = copy(entry.arguments);
  }
  function report() {
    const result = {
      format: 'joons-mcp-mock-server/report', schemaVersion: 1, mock: true,
      server: { mockOf: snapshot.server.name, snapshotToolCount: snapshot.tools.length },
      scenario: options.scenario ?? 'default',
      totals: { calls: count, byOutcome: Object.fromEntries([...outcomes].sort(([a], [b]) => compare(a, b))) },
      tools: Object.fromEntries([...tools].sort(([a], [b]) => compare(a, b))),
      lastCall: lastCall ?? null, calls, droppedCalls: Math.max(0, count - 1000)
    };
    return copy(result);
  }
  return { record, report };
}

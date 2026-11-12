import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { validateArguments } from '../schema/arguments.js';
import { BUILTIN_SCENARIOS, copy, errorResult, resolveResponse, sanitizeDisplay } from './responder.js';
import { createRecorder } from './recorder.js';

export { BUILTIN_SCENARIOS } from './responder.js';

function protocolError(code, message) {
  const error = new McpError(code, message);
  // The SDK serializes Error.message verbatim; its constructor adds a display prefix.
  error.message = sanitizeDisplay(message, 1000);
  return error;
}

export function createMockServer({ snapshot, fixtures = null, options = {} }) {
  options = { scenario: 'default', maxConcurrency: 8, slowDelayMs: 2000, callTimeoutMs: 30000, ...options };
  for (const [key, min, max] of [['maxConcurrency', 1, 64], ['slowDelayMs', 0, 30000], ['callTimeoutMs', 1, 60000]]) {
    if (!Number.isInteger(options[key]) || options[key] < min || options[key] > max) throw new Error('Invalid option: ' + key);
  }
  if (!BUILTIN_SCENARIOS.includes(options.scenario) && !(fixtures?.scenarios && Object.hasOwn(fixtures.scenarios, options.scenario))) throw new Error('Unknown scenario');
  const tools = new Map(snapshot.tools.map((tool) => [tool.name, copy(tool)]));
  const recorder = createRecorder({ snapshot, options });
  const server = new McpServer({ name: 'joons-mcp-mock-server', version: '0.1.0', title: sanitizeDisplay('MOCK of ' + snapshot.server.name, 200) }, {
    capabilities: { tools: { listChanged: false } },
    instructions: 'MOCK MCP SERVER for testing. Tool results come from fixtures; no real actions are performed.'
  });
  // McpServer enables listChanged during construction; this catalog is static.
  server.server.registerCapabilities({ tools: { listChanged: false } });
  let inFlight = 0;
  let closing = false;
  let closePromise;
  const pending = new Set();
  const active = new Set();
  function cancelPending() {
    closing = true;
    for (const finish of [...pending]) finish('closing');
  }
  server.server.onclose = cancelPending;
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [...tools.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0).map((tool) => {
    const result = { name: tool.name, inputSchema: copy(tool.inputSchema) };
    for (const key of ['title', 'description', 'outputSchema', 'annotations']) if (tool[key] != null) result[key] = copy(tool[key]);
    for (const key of ['title', 'description']) if (result[key] != null) result[key] = sanitizeDisplay(result[key]);
    if (options.markDescriptions) result.description = '[MOCK] ' + (result.description ?? '');
    return result;
  }) }));
  async function call({ params }) {
    const name = params.name;
    const args = params.arguments ?? {};
    const record = (outcome, source, unknown = false) => recorder.record({ name, args, outcome, source, unknown });
    if (!tools.has(name)) { record('unknown_tool', 'validation', true); throw protocolError(ErrorCode.InvalidParams, 'Unknown tool: ' + sanitizeDisplay(name, 100)); }
    if (closing) { record('is_error', 'limit'); return errorResult('Mock server closing'); }
    if (inFlight >= options.maxConcurrency) { record('busy', 'limit'); throw protocolError(-32000, 'Mock server busy'); }
    inFlight++;
    try {
      if (Buffer.byteLength(JSON.stringify(args), 'utf8') > 1024 * 1024) { record('invalid_arguments', 'limit'); return errorResult('Arguments too large'); }
      if (options.validateArguments !== false) {
        const validation = validateArguments(tools.get(name).inputSchema, args);
        if (!validation.ok) { record('invalid_arguments', 'validation'); return errorResult('Invalid arguments: ' + validation.errors.slice(0, 10).map((error) => error.path + ': ' + error.message).join('\n')); }
      }
      const { response, source } = resolveResponse({ name, args, fixtures, options });
      const delay = Math.max(response.delayMs ?? 0, options.scenario === 'slow' ? options.slowDelayMs : 0);
      if (delay > 0) {
        const state = await new Promise((resolve) => {
          let timer;
          const finish = (value) => { clearTimeout(timer); pending.delete(finish); resolve(value); };
          pending.add(finish);
          timer = setTimeout(() => finish(delay > options.callTimeoutMs ? 'timeout' : 'done'), Math.min(delay, options.callTimeoutMs));
        });
        if (state === 'closing') { record('is_error', source); return errorResult('Mock server closing'); }
        if (state === 'timeout') { record('timeout', 'limit'); return errorResult('Mock call timed out'); }
      }
      if (response.protocolError) { record('protocol_error', source); throw protocolError(response.protocolError.code ?? -32603, response.protocolError.message); }
      const result = copy(response);
      delete result.delayMs;
      record(result.isError ? 'is_error' : 'result', source);
      return result;
    } finally { inFlight--; }
  }
  server.server.setRequestHandler(CallToolRequestSchema, (request) => {
    const promise = call(request);
    active.add(promise);
    promise.then(() => active.delete(promise), () => active.delete(promise));
    return promise;
  });
  return {
    server,
    connect: (transport) => server.connect(transport),
    close() {
      if (!closePromise) {
        cancelPending();
        closePromise = (async () => {
          await Promise.allSettled([...active]);
          // Let the SDK serialize and deliver the final handler responses.
          await new Promise((resolve) => setImmediate(resolve));
          await server.close();
        })();
      }
      return closePromise;
    },
    report: recorder.report
  };
}

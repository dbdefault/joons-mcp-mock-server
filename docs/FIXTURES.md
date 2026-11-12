# Fixture reference

Fixtures are inert JSON data for a MOCK server. Nothing in them is executed. The top-level object accepts only `format` (exactly `joons-mcp-mock-server/fixtures`), `fixtureVersion` (1), `missingFixture` (`error`, the default, or `empty`), `scenarios`, and `tools`. Unknown structural keys are errors; response payload data may contain arbitrary data. The keys `__proto__`, `constructor`, and `prototype` are rejected outside `content` and `structuredContent` payload data.

`scenarios` maps up to 100 names to objects with optional `description` strings of at most 1,000 characters. Names match `^[a-z][a-z0-9_-]{0,63}$` and cannot be built-in names. `tools` maps up to 10,000 snapshot tool names to entries. With a snapshot, an unknown tool is an error.

Each tool entry must have at least one of:

- `default`: a response.
- `match`: an array of at most 100 objects, each with `arguments` (plain object) and `response`. The first entry for which every listed top-level key exists in the call and is deeply equal wins; additional call arguments are allowed.
- `scenarios`: a map from a declared fixture scenario name to a response.

The active fixture scenario response takes priority over a match, which takes priority over the default. If none exists, `missingFixture` selects an error result or empty content. With no fixture file, the behavior is `error`.

## Responses

A result has required `content`, an array of at most 100 blocks; optional `structuredContent` (plain object), `isError` (boolean), and `delayMs` (integer 0–30000). Blocks are `{ "type": "text", "text": "..." }` or `{ "type": "image" | "audio", "data": "base64...", "mimeType": "..." }`. Other block types are rejected.

A protocol error instead has `protocolError: { code?, message }` and optional `delayMs`. The message is a nonempty string of at most 1,000 characters. Code is an integer, defaults to -32603, and cannot be in -32700 through -32600 except -32603. A serialized response is limited to 4 MiB. The JSON-RPC `error.message` sent on the wire is the message exactly as written (control and bidirectional formatting characters removed, at most 1,000 characters), with no prefix added by the server. Client libraries may format their own exceptions; for example the MCP SDK client prefixes its exception message with "MCP error <code>: ". Result content is returned exactly as written.

For a tool with an output schema, validation with a snapshot warns when a non-error result omits `structuredContent`: standard MCP clients reject such a result. Structured content is allowed for a tool without an output schema. Validation sorts errors and warnings by path and message. See [the complete example](../examples/fixtures.json) and [resolution order](SCENARIOS.md).

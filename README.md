# JOONS MCP Mock Server

![Preview](https://img.shields.io/badge/status-Preview-orange) ![License](https://img.shields.io/badge/license-Apache--2.0-blue) ![Node](https://img.shields.io/badge/node-%3E%3D20-green) [![CI](https://github.com/dbdefault/joons-mcp-mock-server/actions/workflows/ci.yml/badge.svg)](https://github.com/dbdefault/joons-mcp-mock-server/actions/workflows/ci.yml)

Create realistic mock MCP servers from tool snapshots for safe agent development and testing. This independent open-source product reads a snapshot and optional fixtures and serves tools over stdio.

## Safety first

This is a MOCK. Responses come from fixtures; no real actions are ever performed. The server makes no network requests, does not forward calls, launch child processes, or execute or evaluate anything from snapshots or fixtures. It reads the selected inputs; its only file write is the optional report selected by the user. Fixture content that resembles a command, path, or URL remains data.

## Why

Exercise an agent against a repeatable tool catalog and simulated success, failure, and latency without operating a real service. The server runs independently: [JOONS MCP Diff](https://github.com/dbdefault/joons-mcp-diff) can create its snapshot, [JOONS MCP Probe](https://github.com/dbdefault/joons-mcp-probe) diagnoses a real server, and [JOONS MCP Policy Gate](https://github.com/dbdefault/joons-mcp-policy-gate) checks a snapshot against a policy. None is needed at runtime. Part of the [JOONS ecosystem](https://github.com/dbdefault/joons-ecosystem).

## Quick start

Requires Node.js 20 or later. Preview 0.1.0 is not on npm; install from the version tag:

```sh
npm install -g github:dbdefault/joons-mcp-mock-server#v0.1.0
```

Create a schemaVersion 1 snapshot using JOONS MCP Diff, or start with `examples/snapshot.json`. Write a fixture file as in [examples/fixtures.json](examples/fixtures.json). Validate and start:

```sh
joons-mcp-mock-server validate --snapshot examples/snapshot.json
joons-mcp-mock-server validate-fixtures --fixtures examples/fixtures.json --snapshot examples/snapshot.json
joons-mcp-mock-server start --snapshot examples/snapshot.json --fixtures examples/fixtures.json
```

Register it as a stdio server in an MCP client's configuration, using paths accessible to that client:

```json
{ "mcpServers": { "shop-mock": { "command": "joons-mcp-mock-server", "args": ["start", "--snapshot", "examples/snapshot.json", "--fixtures", "examples/fixtures.json"] } } }
```

## Fixture format

Fixtures use `format: "joons-mcp-mock-server/fixtures"` and `fixtureVersion: 1`. A tool can have a `default` response, ordered `match` entries keyed by arguments, and declared scenario responses. Results contain `content` and may contain `structuredContent`, `isError`, and `delayMs`; a response can instead specify a `protocolError`. The first match whose listed top-level arguments are deeply equal wins. Missing fixtures default to an error, or can return empty content. Structural unknown keys are errors. See [the complete reference](docs/FIXTURES.md).

## Scenarios

Built-ins are `default`, `empty`, `error`, `slow`, and `server-error`. Declare named fixture scenarios to override selected tools; `--fail-tool NAME` can be repeated to fail exact tool names. Validation and built-in error/empty scenarios take precedence. Details and resolution order: [scenarios](docs/SCENARIOS.md), [architecture](ARCHITECTURE.md).

## Argument validation

The supported subset is `type`, `enum`, `const`, `required`, `properties`, `additionalProperties` (false or schema), `items` (single schema), `minItems`, `maxItems`, `minLength`, `maxLength`, `minimum`, `maximum`, `exclusiveMinimum`, and `exclusiveMaximum`. String lengths count Unicode code points; equality is deep. Missing arguments are `{}`. All other keywords are ignored, including `pattern`, `format`, `$ref`, `oneOf`, `anyOf`, `allOf`, `not`, `if`, and `patternProperties`. This is not full JSON Schema validation. Use `--no-validate-arguments` to disable it.

## Report and masking

Recording is in memory unless `--report FILE` is supplied; the report is written atomically on shutdown. It includes totals, outcomes, tool summaries, last call, up to the first 1,000 calls, and `droppedCalls`. Sensitive-key values are masked at any depth by default: password, passwd, secret, token, apikey, api_key, api-key, authorization, auth, credential, cookie, session, privatekey, and private_key (case-insensitive). Add exact names with repeatable `--mask-key NAME`, or omit all arguments with `--no-record-arguments`. Strings are truncated at 1,000 characters and depth after 16. Masking cannot identify every secret; review reports before sharing.

## CLI reference

```text
joons-mcp-mock-server start --snapshot FILE [--fixtures FILE] [--scenario NAME] [--fail-tool NAME]... [--slow-delay-ms N] [--call-timeout-ms N] [--max-concurrency N] [--no-validate-arguments] [--mark-descriptions] [--report FILE] [--mask-key NAME]... [--no-record-arguments] [--quiet]
joons-mcp-mock-server validate --snapshot FILE [--format terminal|json]
joons-mcp-mock-server validate-fixtures --fixtures FILE [--snapshot FILE] [--format terminal|json]
joons-mcp-mock-server --help | --version
```

`--mark-descriptions` prefixes descriptions with `[MOCK]`; `--quiet` suppresses the startup banner. Slow delay defaults to 2000 ms (0–30000), call timeout to 30000 ms (1–60000), and concurrency to 8 (1–64). `start` reserves stdout for MCP and writes status to stderr. Validation JSON has `format`, `schemaVersion`, `ok`, `errors`, and `warnings`. Options accept `--opt=value` or `--opt value`; duplicate single-value options are usage errors.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Normal shutdown or valid input, including warnings |
| 2 | Invalid input or configuration |
| 3 | Usage error |
| 4 | Report write failure |

## Limits

Snapshot: 64 MiB; fixtures: 16 MiB; up to 10,000 tools; JSON depth 64 and 2,000,000 nodes. Snapshot strings/keys: 100,000 UTF-16 code units; fixture strings/keys: 1,000,000. Arguments: 1 MiB; fixture responses: 4 MiB, at most 100 blocks. Matching entries: 100 per tool; fixture scenarios: 100. Argument validation returns at most 10 errors. See [fixture reference](docs/FIXTURES.md) for additional constraints.

## Not in 0.1.0

Streamable HTTP, resources, prompts, and pagination are not supported. Only tools are served over stdio.

## Status and license

Preview, version 0.1.0; not published on npm. Licensed under [Apache-2.0](LICENSE). See [security](SECURITY.md) and [contributing](CONTRIBUTING.md).

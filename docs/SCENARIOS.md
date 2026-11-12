# Scenarios

The active `--scenario` defaults to `default` and must be a built-in name or a name declared in the fixture file; an unknown name prevents startup. Built-ins are:

| Name | Behavior |
|---|---|
| `default` | Resolve fixtures normally. |
| `empty` | Return empty content. |
| `error` | Return an `isError` result. |
| `server-error` | Return MCP internal error -32603. |
| `slow` | Resolve normally, with a delay of at least `--slow-delay-ms` (default 2000 ms). |

Unknown tools, concurrency limits and argument validation are checked first. The `empty`, `error`, and `server-error` built-ins then take precedence over `--fail-tool`. Repeat `--fail-tool NAME` for exact tool names to return an error result. Otherwise a declared fixture scenario response wins, followed by the first matching argument entry, default response, and missing-fixture behavior. See [fixture reference](FIXTURES.md).

Response delays are 0–30000 ms. For `slow`, the larger of the response delay and slow delay applies. The call timeout defaults to 30000 ms and is configurable from 1 to 60000 ms; a call exceeding it returns an error result. Calls and results are simulated and deterministic for the same inputs, options, and call sequence.

```sh
joons-mcp-mock-server start --snapshot examples/snapshot.json --fixtures examples/fixtures.json --scenario checkout-outage
joons-mcp-mock-server start --snapshot examples/snapshot.json --fail-tool create_order
```

# Examples

These fictional shop examples describe a MOCK server. No purchase, cancellation, customer lookup, network request, or other real action occurs. Fixture text and snapshot data are never executed.

```sh
joons-mcp-mock-server validate --snapshot examples/snapshot.json
joons-mcp-mock-server validate-fixtures --fixtures examples/fixtures.json --snapshot examples/snapshot.json
joons-mcp-mock-server start --snapshot examples/snapshot.json --fixtures examples/fixtures.json
```

Use `--scenario checkout-outage` to simulate a failed order and a protocol error for cancellation. Search for `boots` to select the match response; other valid searches select the default response. See [fixtures](../docs/FIXTURES.md) and [scenarios](../docs/SCENARIOS.md).

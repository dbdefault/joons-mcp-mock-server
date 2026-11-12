# Security

## Threat model

Snapshots, fixtures, and tool arguments can be untrusted. The server treats them as data: it does not execute or evaluate them, forward calls, make network requests, launch child processes, or perform real tool actions. The only intended file write is an optional user-selected report, written on shutdown. Reading the selected input files is necessary to run the server.

Input size, depth, node count, tool count, response size, argument size, concurrency, and time are bounded; see [README.md](README.md#limits). Fixture structural keys that could pollute prototypes are rejected outside response payload data. Diagnostic messages omit input contents, argument values, fixture text, and file paths, and sanitize untrusted text.

Tool names containing control, DEL, C1 or bidirectional formatting characters are rejected when the snapshot is validated. Titles, descriptions and protocol error messages are served with those control characters removed (newlines and tabs are kept). Removing the ESC byte disables ANSI escape sequences, but their printable remainder (for example `[31m`) stays visible as literal text. A hostile snapshot or fixture therefore cannot inject active terminal formatting or reverse the reading direction in a client display. Fixture result content (text and structuredContent) is your own test data and is returned exactly as written.

Reports may contain arguments. Masking is enabled by default for specified sensitive key names, but cannot identify every secret. Use `--mask-key` for additional exact keys or `--no-record-arguments` to omit arguments. Review a report before sharing it.

## Reporting a vulnerability

Use GitHub private vulnerability reporting on the repository's Security tab. Include a minimal sanitized reproduction and the affected version. Please do not disclose a vulnerability in a public issue before maintainers can investigate.

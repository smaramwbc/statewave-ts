# AGENTS.md — guide for contributors and coding agents

A short orientation for humans and AI coding agents (GitHub Copilot, Claude,
Cursor, …) working in **statewave-ts** — the TypeScript SDK for Statewave
(`npm install @statewavedev/sdk`), the typed client over the `/v1` API.

## Setup, build, test

See the [README](README.md) for canonical setup. In short:

```bash
npm install
npm test        # vitest run
npm run build   # tsc
```

Make sure the build and tests pass before opening a PR.

## Conventions

- **Code style & testing:** see
  [statewave-docs/dev/conventions.md](https://github.com/smaramwbc/statewave-docs/blob/main/dev/conventions.md).
- **This SDK versions independently** of the server and the Python SDK; the
  compatibility axis is the `/v1` API contract, not a shared version number.
  Don't align version strings across packages.
- **Keep claims accurate and modest** in docs and examples; avoid unqualified
  superlatives.

## Pull requests

Keep PRs focused, add tests for behavior changes, and make sure `npm test` and
`npm run build` pass.

## Optional: give your agent memory of this repo (with Statewave)

This project dogfoods Statewave. To let your assistant recall this repo's
context, serve it through the Statewave MCP server: run an instance, ingest
this repo via the GitHub or Markdown connector into subject
`repo:smaramwbc/statewave-ts`, and point your MCP client at
`@statewavedev/mcp-server`. See the
[MCP server](https://github.com/smaramwbc/statewave-docs/blob/main/connectors/mcp.md)
and
[connectors quickstart](https://github.com/smaramwbc/statewave-docs/blob/main/connectors/quickstart.md)
docs. Your agent can then call `statewave_get_context` with subject
`repo:smaramwbc/statewave-ts`.

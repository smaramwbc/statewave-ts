# Statewave TypeScript SDK

[![CI](https://github.com/smaramwbc/statewave-ts/workflows/CI/badge.svg)](https://github.com/smaramwbc/statewave-ts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@statewavedev/sdk)](https://www.npmjs.com/package/@statewavedev/sdk)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Official TypeScript SDK for [Statewave](https://github.com/smaramwbc/statewave) — memory runtime for AI agents and applications.

> **Part of the Statewave ecosystem:** [Server](https://github.com/smaramwbc/statewave) · [Python SDK](https://github.com/smaramwbc/statewave-py) · **TypeScript SDK** · [Connectors](https://github.com/smaramwbc/statewave-connectors) · [Docs](https://github.com/smaramwbc/statewave-docs) · [Examples](https://github.com/smaramwbc/statewave-examples) · [Website + demo](https://statewave.ai) · [Admin](https://github.com/smaramwbc/statewave-admin)
>
> 📋 **Issues & feature requests:** [statewave/issues](https://github.com/smaramwbc/statewave/issues) (centralized tracker)

> ⚠️ **v0.9.0 is a breaking change.** The entire SDK surface — request params *and* response fields — is now idiomatic **camelCase** (`subjectId`, `maxTokens`, `createdAt`, `receiptId`, …). The wire protocol is unchanged; the client maps to/from the server's snake_case transparently. `payload`, `metadata`, and `provenance` are passed through verbatim — their inner keys are never rewritten. See [CHANGELOG](CHANGELOG.md#090) for the full rename table and migration steps.

> **New to Statewave?** This SDK is a thin client for a running **Statewave
> server**. If you don't have one yet, the
> [Getting Started guide](https://github.com/smaramwbc/statewave-docs/blob/main/getting-started.md)
> brings one up with Docker Compose in about 5 minutes. Every example below
> assumes a server reachable at `http://localhost:8100`.

## Install

```bash
npm install @statewavedev/sdk
```

## Quick start

```typescript
import { StatewaveClient } from "@statewavedev/sdk";

// Basic (no auth)
const sw = new StatewaveClient("http://localhost:8100");

// With authentication and tenant
const swAuth = new StatewaveClient({
  baseUrl: "http://localhost:8100",
  apiKey: "your-key",
  tenantId: "acme",
});

// Record an episode
await sw.createEpisode({
  subjectId: "user-42",
  source: "support-chat",
  type: "conversation",
  payload: {
    messages: [
      { role: "user", content: "My name is Alice and I work at Globex." },
      { role: "assistant", content: "Welcome Alice!" },
    ],
  },
});

// Compile memories (idempotent)
const result = await sw.compileMemories("user-42");
console.log(`Created ${result.memoriesCreated} memories`);

// Retrieve ranked, token-bounded context
const ctx = await sw.getContext({
  subjectId: "user-42",
  task: "Help with billing",
  maxTokens: 300,
});
console.log(ctx.assembledContext);

// Batch ingestion (up to 100)
await sw.createEpisodesBatch([
  { subjectId: "user-42", source: "crm", type: "note", payload: { text: "Prefers email" } },
  { subjectId: "user-42", source: "crm", type: "note", payload: { text: "Enterprise plan" } },
]);

// Search memories
const facts = await sw.searchMemories({
  subjectId: "user-42",
  kind: "profile_fact",
});

// Semantic search (requires embeddings)
const results = await sw.searchMemories({
  subjectId: "user-42",
  query: "billing",
  semantic: true,
});

// List all known subjects
const subjects = await sw.listSubjects();
for (const s of subjects.subjects) {
  console.log(`${s.subjectId}: ${s.episodeCount} episodes, ${s.memoryCount} memories`);
}

// Get timeline
const timeline = await sw.getTimeline("user-42");
console.log(`${timeline.episodes.length} episodes, ${timeline.memories.length} memories`);

// Delete all subject data
await sw.deleteSubject("user-42");
```

## Governance & audit (v0.8)

The SDK surfaces the [state-assembly receipts](https://github.com/smaramwbc/statewave-docs/blob/main/receipts.md) and [sensitivity-labels / policy](https://github.com/smaramwbc/statewave-docs/blob/main/sensitivity-labels.md) layer added in server v0.8.

```typescript
import { StatewaveClient } from "@statewavedev/sdk";

const sw = new StatewaveClient({
  baseUrl: "http://localhost:8100",
  apiKey: "your-key",
  tenantId: "acme",
});

// Per-request opt-in for an immutable audit receipt of the assembly.
// callerId / callerType feed the sensitivity-label policy engine —
// when the tenant config sets require_caller_identity=true, missing
// values 401.
const bundle = await sw.getContext({
  subjectId: "user-42",
  task: "What plan is this customer on?",
  emitReceipt: true,
  callerId: "agent-7",
  callerType: "support_agent",
});

if (bundle.receiptId) {
  // Receipts are ULID-addressable, tenant-scoped, append-only.
  const receipt = await sw.getReceipt(bundle.receiptId);
  // output.contextHash is a SHA-256 of the bytes delivered to the
  // agent — recompute from bundle.assembledContext to verify integrity.
  console.log(receipt.output.contextHash);
  console.log(`${receipt.selectedEntries.length} entries influenced this bundle`);
}

// List receipts for a subject, cursor-paginated, newest-first.
const { receipts, nextCursor } = await sw.listReceipts({
  subjectId: "user-42",
  limit: 10,
});
for (const r of receipts) {
  console.log(r.receiptId, r.task);
}

// Set per-memory sensitivity labels (server normalizes — dedup, lowercase, trim).
// Memories with labels become subject to any active policy bundle for the tenant.
const updated = await sw.setMemoryLabels({
  memoryId: "mem-uuid",
  sensitivityLabels: ["pii", "financial"],
});
console.log(updated.sensitivityLabels); // → ["financial", "pii"]
```

Receipts and the policy engine cooperate: every assembly call records its policy decisions into `receipt.policy.filtersApplied` (one entry per memory the policy fired on) and `receipt.policy.filtersSkipped` (per-rule summary of what didn't fire). In `log_only` mode (the tenant default) the receipt is the full audit trail without filtering; under `enforce` denied memories are dropped before they reach the assembly and the deny is still recorded. See [`receipts.md`](https://github.com/smaramwbc/statewave-docs/blob/main/receipts.md) and [`sensitivity-labels.md`](https://github.com/smaramwbc/statewave-docs/blob/main/sensitivity-labels.md) for the full schemas and policy YAML format.

## Error handling

```typescript
import { StatewaveClient, StatewaveAPIError, StatewaveConnectionError } from "@statewavedev/sdk";

const sw = new StatewaveClient();

try {
  await sw.compileMemories("user-42");
} catch (e) {
  if (e instanceof StatewaveAPIError) {
    console.error(`API error [${e.statusCode}]: ${e.code} — ${e.message}`);
    console.error(`Request ID: ${e.requestId}`);
  } else if (e instanceof StatewaveConnectionError) {
    console.error("Cannot connect to Statewave server");
  }
}
```

## Where does data go?

The SDK is a thin client over the Statewave HTTP API. What leaves the network is determined by the **server's** compiler and embedding configuration, not by the SDK:

- Default deployment (heuristic compiler, no embeddings) — nothing leaves your infrastructure.
- LLM compiler or hosted embeddings — the server sends content to the provider you configure.

See [Privacy & Data Flow](https://github.com/smaramwbc/statewave-docs/blob/main/architecture/privacy-and-data-flow.md) for the full breakdown.

## Types

All response types are fully typed:

- `Episode` — raw interaction record
- `Memory` — compiled memory with provenance + optional `sensitivityLabels`
- `CompileResult` — compilation response
- `SearchResult` — search response
- `ContextBundle` — assembled context with facts, episodes, provenance, optional `receiptId` / `receiptEmitted`
- `Timeline` — chronological subject history
- `DeleteResult` — deletion confirmation
- `BatchCreateResult` — batch ingestion response
- `SubjectSummary` — subject with episode/memory counts
- `ListSubjectsResult` — paginated subject listing
- `Receipt` + `ReceiptSelectedEntry` + `ReceiptPolicy` + `ReceiptOutput` — state-assembly audit artifact (v0.8) and its nested shapes
- `ReceiptList` — cursor-paginated receipt listing

Param types: `CreateEpisodeParams`, `SearchMemoriesParams`, `GetContextParams`, `ListReceiptsParams`, `SetMemoryLabelsParams`

## Running tests

```bash
npm install
npm test
```

## License

Apache-2.0

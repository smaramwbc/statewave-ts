# Statewave TypeScript SDK

[![CI](https://github.com/smaramwbc/statewave-ts/workflows/CI/badge.svg)](https://github.com/smaramwbc/statewave-ts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@statewavedev/sdk)](https://www.npmjs.com/package/@statewavedev/sdk)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Official TypeScript SDK for [Statewave](https://github.com/smaramwbc/statewave) — memory runtime for AI agents and applications.

> **Part of the Statewave ecosystem:** [Server](https://github.com/smaramwbc/statewave) · [Python SDK](https://github.com/smaramwbc/statewave-py) · **TypeScript SDK** · [Connectors](https://github.com/smaramwbc/statewave-connectors) · [Docs](https://github.com/smaramwbc/statewave-docs) · [Examples](https://github.com/smaramwbc/statewave-examples) · [Website + demo](https://statewave.ai) · [Admin](https://github.com/smaramwbc/statewave-admin)
>
> 📋 **Issues & feature requests:** [statewave/issues](https://github.com/smaramwbc/statewave/issues) (centralized tracker)

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
  subject_id: "user-42",
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
console.log(`Created ${result.memories_created} memories`);

// Retrieve ranked, token-bounded context
const ctx = await sw.getContext({
  subject_id: "user-42",
  task: "Help with billing",
  max_tokens: 300,
});
console.log(ctx.assembled_context);

// Batch ingestion (up to 100)
await sw.createEpisodesBatch([
  { subject_id: "user-42", source: "crm", type: "note", payload: { text: "Prefers email" } },
  { subject_id: "user-42", source: "crm", type: "note", payload: { text: "Enterprise plan" } },
]);

// Search memories
const facts = await sw.searchMemories({
  subject_id: "user-42",
  kind: "profile_fact",
});

// Semantic search (requires embeddings)
const results = await sw.searchMemories({
  subject_id: "user-42",
  query: "billing",
  semantic: true,
});

// List all known subjects
const subjects = await sw.listSubjects();
for (const s of subjects.subjects) {
  console.log(`${s.subject_id}: ${s.episode_count} episodes, ${s.memory_count} memories`);
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
// caller_id / caller_type feed the sensitivity-label policy engine —
// when the tenant config sets require_caller_identity=true, missing
// values 401.
const bundle = await sw.getContext({
  subject_id: "user-42",
  task: "What plan is this customer on?",
  emit_receipt: true,
  caller_id: "agent-7",
  caller_type: "support_agent",
});

if (bundle.receipt_id) {
  // Receipts are ULID-addressable, tenant-scoped, append-only.
  const receipt = await sw.getReceipt(bundle.receipt_id);
  // output.context_hash is a SHA-256 of the bytes delivered to the
  // agent — recompute from bundle.assembled_context to verify integrity.
  console.log(receipt.output.context_hash);
  console.log(`${receipt.selected_entries.length} entries influenced this bundle`);
}

// List receipts for a subject, cursor-paginated, newest-first.
const { receipts, next_cursor } = await sw.listReceipts({
  subject_id: "user-42",
  limit: 10,
});
for (const r of receipts) {
  console.log(r.receipt_id, r.task);
}

// Set per-memory sensitivity labels (server normalizes — dedup, lowercase, trim).
// Memories with labels become subject to any active policy bundle for the tenant.
const updated = await sw.setMemoryLabels({
  memory_id: "mem-uuid",
  sensitivity_labels: ["pii", "financial"],
});
console.log(updated.sensitivity_labels); // → ["financial", "pii"]
```

Receipts and the policy engine cooperate: every assembly call records its policy decisions into `receipt.policy.filters_applied` (one entry per memory the policy fired on) and `receipt.policy.filters_skipped` (per-rule summary of what didn't fire). In `log_only` mode (the tenant default) the receipt is the full audit trail without filtering; under `enforce` denied memories are dropped before they reach the assembly and the deny is still recorded. See [`receipts.md`](https://github.com/smaramwbc/statewave-docs/blob/main/receipts.md) and [`sensitivity-labels.md`](https://github.com/smaramwbc/statewave-docs/blob/main/sensitivity-labels.md) for the full schemas and policy YAML format.

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
- `Memory` — compiled memory with provenance + optional `sensitivity_labels`
- `CompileResult` — compilation response
- `SearchResult` — search response
- `ContextBundle` — assembled context with facts, episodes, provenance, optional `receipt_id` / `receipt_emitted`
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

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

## Governance & audit (v0.8+)

The SDK surfaces the [state-assembly receipts](https://github.com/smaramwbc/statewave-docs/blob/main/receipts.md) and [sensitivity-labels / policy](https://github.com/smaramwbc/statewave-docs/blob/main/sensitivity-labels.md) layer added in server v0.8, plus the v0.9 [HMAC signing](https://github.com/smaramwbc/statewave/blob/main/docs/state-assembly-receipts.md) and [as-of replay](https://github.com/smaramwbc/statewave/blob/main/docs/replay.md) surfaces.

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

// Verify the HMAC signature on a stored receipt (v0.9+).
// `valid` is true | false | null — see ReceiptVerifyResult for the
// full reason vocabulary (no_signature / key_unavailable / etc.).
if (bundle.receiptId) {
  const verdict = await sw.verifyReceipt(bundle.receiptId);
  if (verdict.valid === true) {
    console.log(`signature OK — signed by ${verdict.keyId}`);
  } else if (verdict.valid === false) {
    console.log("signature mismatch — body may have been tampered with");
  } else {
    console.log(`verdict undetermined: ${verdict.reason}`);
  }
}

// Replay the receipt against current memories using the original
// policy bundle captured on the receipt (v0.9+). Returns a diff
// envelope showing what changed since emission. Pre-v0.9 receipts
// throw StatewaveUnreplayableError with reason="missing_policy_snapshot".
import { StatewaveUnreplayableError } from "@statewavedev/sdk";
try {
  const replay = await sw.replayReceipt(bundle.receiptId!);
  if (replay.diff.contextHash.changed) {
    console.log(`replay differs from original: new id ${replay.replayReceiptId}`);
  }
} catch (err) {
  if (err instanceof StatewaveUnreplayableError) {
    // err.reason ∈ {"missing_policy_snapshot", "nested_replay", "invalid_snapshot"}
    console.log(`replay refused: ${err.reason}`);
  } else {
    throw err;
  }
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

## Support-agent endpoints

Statewave's support wedge — customer health scoring, SLA tracking, resolution state, and structured escalation briefs — is exposed through ergonomic SDK methods (server v0.6+).

```typescript
import { StatewaveClient } from "@statewavedev/sdk";

const sw = new StatewaveClient("http://localhost:8100");

// Customer health score (0–100) with the explainable factors behind it.
const health = await sw.getHealth("customer:globex");
console.log(`${health.score}/100 — ${health.state}`);
for (const f of health.factors) {
  console.log(`  ${f.signal}: ${f.impact >= 0 ? "+" : ""}${f.impact} (${f.detail})`);
}

// SLA metrics — first-response / resolution times and breach counts.
// Thresholds are optional; they default server-side to 5 min / 24 h.
const sla = await sw.getSLA({
  subjectId: "customer:globex",
  firstResponseThresholdMinutes: 10,
  resolutionThresholdHours: 48,
});
console.log(`${sla.resolvedSessions}/${sla.totalSessions} resolved, ${sla.resolutionBreachCount} SLA breaches`);

// Track resolution state for a session (upserts by subject + session).
await sw.createResolution({
  subjectId: "customer:globex",
  sessionId: "ticket-8842",
  status: "resolved",
  resolutionSummary: "Issued refund for the duplicate charge",
});

// List resolutions, optionally filtered by status.
const openItems = await sw.listResolutions({
  subjectId: "customer:globex",
  status: "open",
});

// Generate a handoff context pack for escalation or shift change.
// `handoffNotes` is a pre-rendered markdown brief for human or LLM use.
const handoff = await sw.createHandoff({
  subjectId: "customer:globex",
  sessionId: "ticket-8842",
  reason: "escalation",
  callerId: "agent-7",
  callerType: "support_agent",
});
console.log(handoff.handoffNotes);
```

`getHealth`, `getSLA`, `createResolution`, `listResolutions`, and `createHandoff` respect the same auth, tenant-scoping, and retry behaviour as the rest of the client. `createHandoff` shares `getContext`'s caller-identity gate — when the tenant config sets `require_caller_identity: true`, both `callerId` and `callerType` are mandatory.

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
- `Receipt` + `ReceiptSelectedEntry` + `ReceiptPolicy` + `ReceiptOutput` — state-assembly audit artifact (v0.8+) and its nested shapes; v0.9 added HMAC signature fields (`receiptSignatureKeyId`, `receiptSignatureAlgorithm`), `policySnapshot` for replay, and `region` for residency
- `ReceiptVerifyResult` — `valid` (true | false | null) + `keyId` + `algorithm` + `reason` for the v0.9 HMAC verify endpoint
- `ReceiptReplayResult` / `ReceiptReplayDiff` — original + replay receipt ids plus the structural diff envelope from `POST /v1/receipts/{id}/replay` (v0.9)
- `StatewaveUnreplayableError` — thrown by `replayReceipt(...)` on HTTP 422; `.reason` is a discriminated union of `"missing_policy_snapshot" | "nested_replay" | "invalid_snapshot"`
- `ReceiptList` — cursor-paginated receipt listing
- `Health` + `HealthFactor` — customer health score and its explainable factors
- `SLASummary` + `SessionSLA` — SLA metrics, aggregate and per-session
- `Handoff` + `ResolutionSummaryItem` — handoff context pack and its prior-resolution items
- `Resolution` — resolution tracking record
- `HealthState` / `ResolutionStatus` — string-literal status unions

Param types: `CreateEpisodeParams`, `SearchMemoriesParams`, `GetContextParams`, `ListReceiptsParams`, `SetMemoryLabelsParams`, `GetSLAParams`, `CreateHandoffParams`, `CreateResolutionParams`, `ListResolutionsParams`

## Running tests

```bash
npm install
npm test
```

## License

Apache-2.0

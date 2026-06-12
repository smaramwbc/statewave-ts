# Changelog

## Unreleased

- `createEpisode` / `createEpisodesBatch` accept an optional `idempotencyKey`. Re-ingesting an episode with the same key is a no-op server-side (the server returns the existing episode), so re-running a backfill or retrying a request no longer duplicates episodes.

## 1.0.1 (2026-06-11)

Metadata-only refresh — no API or behavior changes. Republishes the package so the
registry reflects the corrected packaging metadata that landed after 1.0.0:

- `bugs` URL points to the central Statewave issue tracker
  (`github.com/smaramwbc/statewave/issues`); per-repo Issues tabs are disabled.
- Maturity wording aligned to the conservative canonical framing ("first stable
  public developer release") — no production-ready / enterprise-ready claims.

The public API, wire protocol, and behavior are identical to 1.0.0.

## 1.0.0 (2026-06-09)

First **stable** public release of the Statewave TypeScript SDK (`@statewavedev/sdk`), cut alongside the Statewave v1.0 server. The typed surface matches the `/v1` REST contract and is semver-stable from 1.0.0 forward. This release supersedes the never-published 0.10.2 prep and folds in its changes.

### Fixed — `sessionId` now reaches the wire on `createEpisode` / `createEpisodesBatch` (closes [statewave#174](https://github.com/smaramwbc/statewave/issues/174))

- `CreateEpisodeParams.sessionId` has been declared since v0.10.0 but was silently dropped before serialization; it is now forwarded as snake_case `session_id`, omitted from the body when unset, and fixed per-item in `createEpisodesBatch`. Pure-additive on the wire; existing call sites are unaffected. (Originally prepared as 0.10.2, below.)

## 0.10.2 (2026-05-27 — unreleased; folded into 1.0.0)

### Fixed — `sessionId` now actually reaches the wire on `createEpisode` (closes [statewave#174](https://github.com/smaramwbc/statewave/issues/174))

The `CreateEpisodeParams` type has declared `sessionId?: string` since v0.10.0, but the `createEpisode` method was enumerating its forwarded fields by name and silently dropping `sessionId` before serialization. TypeScript users who set the field thinking it would attribute the episode to a session got episodes ingested without it. v0.9.4 launch-readiness picked this up as a visible REST-contract / SDK-behaviour mismatch worth closing before v1.0.

- `createEpisode` now forwards `sessionId` to the wire as snake_case `session_id` when set. Omitted from the body when unset (matches the server's "no session pin" semantics — server does not auto-assign).
- `createEpisodesBatch` has the same fix, per-item.
- Pure-additive surface change. No breaking move; existing call sites continue to work byte-for-byte unchanged.
- Round-trip is write-only: the server's `Episode` response does not echo `session_id` today, so the `Episode` type is unchanged.

### Tests (+3)

- `omits session_id from the wire when caller does not pass sessionId` — regression guard on the unchanged-wire-shape path.
- `forwards sessionId to the wire as snake_case session_id when set` — the bug-fix proof.
- `forwards sessionId per item in createEpisodesBatch` — same fix exercised on the batch endpoint.

Full suite: **34 passed** (was 31). `tsc` build clean.

## 0.10.1 (2026-05-27)

### Added — v0.9 receipt-governance convenience methods (closes [statewave#170](https://github.com/smaramwbc/statewave/issues/170))

Closes the gap where the v0.9 server release (`statewave` v0.9.1 / v0.9.2) added `GET /v1/receipts/{id}/verify` and `POST /v1/receipts/{id}/replay` but the SDK at v0.10.0 only knew about pre-v0.9 receipt endpoints.

- **`verifyReceipt(receiptId): Promise<ReceiptVerifyResult>`** on `StatewaveClient`. Calls `GET /v1/receipts/{id}/verify` and returns a typed result with `valid` ∈ `{true, false, null}` plus `keyId`, `algorithm`, and a discriminated-union `reason` (`"ok" | "signature_mismatch" | "no_signature" | "key_unavailable" | "unsupported_algorithm"`). Comparison is constant-time on the server side; signing key bytes never appear on the response.
- **`replayReceipt(receiptId): Promise<ReceiptReplayResult>`** on `StatewaveClient`. Calls `POST /v1/receipts/{id}/replay` and returns the original/replay receipt ids plus a typed `ReceiptReplayDiff` envelope (`contextHash`, `selectedEntries.{added,removed,common}`, `filtersApplied.{added,removed}`). The original receipt is never modified — replay only emits a new linked child.
- **`StatewaveUnreplayableError`** (subclass of `StatewaveAPIError`) wraps the server's HTTP 422 refusal codes so callers can `if (err instanceof StatewaveUnreplayableError) { switch (err.reason) ... }` instead of parsing error code strings. `.reason` is the `UnreplayableReason` discriminated union (`"missing_policy_snapshot" | "nested_replay" | "invalid_snapshot"`). An *unrecognised* `unreplayable.<new_reason>` from a future server stays on the generic `StatewaveAPIError` path — does not crash an older client.

### Changed — `Receipt` interface gains v0.9 governance fields

The `Receipt` interface now declares the v0.9 fields the server began emitting in v0.9.1, all optional so pre-v0.9 receipts continue to parse cleanly:

- `receiptSignatureKeyId?: string | null` — operator key id used to sign (#157).
- `receiptSignatureAlgorithm?: string | null` — e.g. `"hmac-sha256-canonical-v1"` (#157).
- `policySnapshot?: PolicySnapshot | null` — embedded bundle YAML + hash + capture timestamp the replay engine evaluates against (#159).
- `mode` union widened from `"retrieval" | string` to `"retrieval" | "as_of_replay" | string` to surface the new replay mode.

Without this change, pre-v0.10.1 clients hitting a v0.9.1+ server would still see the values at runtime (the wire arrives intact) but the TypeScript type would not document them and users had to cast.

New public types: `PolicySnapshot`, `ReceiptVerifyResult`, `ReceiptReplayResult`, `ReceiptReplayDiff`, `UnreplayableReason`.

### Notes

- Purely additive — no existing method, interface, or behaviour changes. Upgrading from v0.10.0 should be a drop-in replacement.
- Version-aligned with `statewave-py` v0.10.1, which lands the equivalent Python surface in parallel.
- Part of the `statewave` v0.9.2 stabilization patch — see [v0.9.2 release notes](https://github.com/smaramwbc/statewave/releases/tag/v0.9.2) for the coordinated context.

## 0.10.0 (2026-05-21)

### Added — support-agent SDK methods

Ergonomic wrappers for the support-agent endpoints (server v0.6+), so the support wedge no longer needs raw HTTP calls alongside the SDK:

- `getHealth(subjectId) -> Health` — customer health score (0–100) with the explainable factors behind it.
- `getSLA({ subjectId, firstResponseThresholdMinutes?, resolutionThresholdHours? }) -> SLASummary` — first-response / resolution times and breach counts, aggregated across the subject's sessions. Thresholds fall back to the server defaults (5 min / 24 h).
- `createResolution({ subjectId, sessionId, status?, resolutionSummary?, metadata? }) -> Resolution` — create or update a resolution record; upserts by `subjectId` + `sessionId`.
- `listResolutions({ subjectId, status? }) -> Resolution[]` — list resolution records for a subject, optionally filtered by status.
- `createHandoff({ subjectId, sessionId, reason?, maxTokens?, ... }) -> Handoff` — generate a structured escalation brief. Shares `getContext`'s caller-identity gate (`callerId` / `callerType`).

New response types: `Health`, `HealthFactor`, `SLASummary`, `SessionSLA`, `Handoff`, `ResolutionSummaryItem`, `Resolution`. New param types: `GetSLAParams`, `CreateHandoffParams`, `CreateResolutionParams`, `ListResolutionsParams`. New string-literal unions: `HealthState`, `ResolutionStatus`.

### Notes

- Purely additive — no existing method, type, or behaviour changes. The HTTP wire contract is unchanged; these methods wrap endpoints the server has exposed since v0.6.
- camelCase ⇄ snake_case mapping, auth, tenant-scoping, and retry behaviour are inherited from the shared request path. `provenance` (on `Handoff`) and `metadata` (on `Resolution`) are passed through verbatim like every other opaque bag.

## 0.9.0 (2026-05-16)

### Breaking — SDK surface is now camelCase (#103)

The TypeScript SDK previously mixed conventions: the client constructor
options were camelCase (`baseUrl`, `apiKey`, `tenantId`) while every
request param and response field was snake_case (`subject_id`,
`max_tokens`, `created_at`, …). That inconsistency is fixed — the
**entire public surface is now idiomatic camelCase**.

- The Statewave HTTP API contract is **unchanged**. The client maps
  camelCase ⇄ the server's snake_case transparently in both directions,
  so no server upgrade is required and any server version still works.
- The free-form `payload`, `metadata`, and `provenance` bags are passed
  through **verbatim** — their inner keys are never rewritten, so
  arbitrary caller data round-trips byte-for-byte.
- This is a deliberate pre-1.0 breaking release. It is a **minor** bump
  (not a patch) so `^0.x` ranges do not silently auto-upgrade.

**Migration** — rename keys at every call site and on every response
you read. The renames are mechanical (snake_case → camelCase):

| Before (snake_case)        | After (camelCase)         |
| -------------------------- | ------------------------- |
| `subject_id`               | `subjectId`               |
| `max_tokens`               | `maxTokens`               |
| `session_id`               | `sessionId`               |
| `memory_id`                | `memoryId`                |
| `sensitivity_labels`       | `sensitivityLabels`       |
| `emit_receipt`             | `emitReceipt`             |
| `query_id`                 | `queryId`                 |
| `task_id`                  | `taskId`                  |
| `parent_receipt_id`        | `parentReceiptId`         |
| `caller_id`                | `callerId`                |
| `caller_type`              | `callerType`              |
| `created_at`               | `createdAt`               |
| `updated_at`               | `updatedAt`               |
| `valid_from`               | `validFrom`               |
| `valid_to`                 | `validTo`                 |
| `source_episode_ids`       | `sourceEpisodeIds`        |
| `memories_created`         | `memoriesCreated`         |
| `episodes_created`         | `episodesCreated`         |
| `episode_count`            | `episodeCount`            |
| `memory_count`             | `memoryCount`             |
| `episodes_deleted`         | `episodesDeleted`         |
| `memories_deleted`         | `memoriesDeleted`         |
| `job_id`                   | `jobId`                   |
| `assembled_context`        | `assembledContext`        |
| `token_estimate`           | `tokenEstimate`           |
| `receipt_id`               | `receiptId`               |
| `receipt_emitted`          | `receiptEmitted`          |
| `next_cursor`              | `nextCursor`              |
| `selected_entries`         | `selectedEntries`         |
| `context_hash`             | `contextHash`             |
| `context_size_bytes`       | `contextSizeBytes`        |
| `canonicalization_version` | `canonicalizationVersion` |
| `policy_bundle_hash`       | `policyBundleHash`        |
| `filters_applied`          | `filtersApplied`          |
| `filters_skipped`          | `filtersSkipped`          |
| `receipt_signature`        | `receiptSignature`        |
| `tenant_id`                | `tenantId`                |
| `as_of`                    | `asOf`                    |
| `event_type`               | `eventType`               |
| `occurred_at`              | `occurredAt`              |
| `provenance_hash`          | `provenanceHash`          |
| `fact_key`                 | `factKey`                 |
| `conflict_status`          | `conflictStatus`          |
| `supersession_status`      | `supersessionStatus`      |
| `episode_id`               | `episodeId`               |

```diff
- await sw.createEpisode({ subject_id: "user-42", source: "crm", type: "note", payload: {...} });
+ await sw.createEpisode({ subjectId: "user-42", source: "crm", type: "note", payload: {...} });

- const ctx = await sw.getContext({ subject_id: "user-42", task: "...", max_tokens: 300 });
- console.log(ctx.assembled_context);
+ const ctx = await sw.getContext({ subjectId: "user-42", task: "...", maxTokens: 300 });
+ console.log(ctx.assembledContext);
```

> Note: the Python SDK (`statewave`) intentionally stays snake_case —
> that is idiomatic Python. Each SDK follows its language's convention;
> the wire contract is the shared snake_case interface underneath.

## 0.8.0 (2026-05-14)

### Added — governance & audit surface

- `Receipt`, `ReceiptSelectedEntry`, `ReceiptPolicy`, `ReceiptOutput`, `ReceiptList`, `ListReceiptsParams`, `SetMemoryLabelsParams` — first-class TypeScript types for the new state-assembly receipt schema and the policy-layer surface.
- `ContextBundle` gains optional `receipt_id?: string | null` and `receipt_emitted?: boolean` — `?` so responses from older servers parse cleanly.
- `Memory` gains optional `sensitivity_labels?: string[]` — the per-memory capability tags consumed by the policy layer.
- `GetContextParams` accepts new optional fields:
  - `emit_receipt?: boolean` — opt-in per-request receipt emission (overridden by tenant config).
  - `query_id?`, `task_id?` — caller-supplied correlation ids recorded on the receipt.
  - `parent_receipt_id?` — ULID of a parent receipt to chain multi-step tasks.
  - `caller_id?`, `caller_type?` — identity fed to the sensitivity-label policy evaluator.
- New client methods on `StatewaveClient`:
  - `getReceipt(receiptId): Promise<Receipt>` — fetch one receipt by ULID.
  - `listReceipts(params): Promise<ReceiptList>` — cursor-paginated, newest-first.
  - `setMemoryLabels(params): Promise<Memory>` — replace `sensitivity_labels`; server normalizes (dedup + lowercase + trim).

### Notes

- All new fields and methods are backwards-compatible. The new types use `?` for fields that older servers omit; the SDK doesn't break when calling pre-#49 servers.
- Companion server release at the same version (statewave v0.8.0).

## 0.7.2 (2026-05-12)

- Version aligned with server v0.7.2 (per-kind memory TTL, Helm chart, query embedding cache, `MemoryStatus.tombstoned` rename).
- No client API changes — server-side release.

## 0.7.1 (2026-05-10)

- Package `description` aligned to the canonical Statewave tagline: "Official TypeScript SDK for Statewave — the open-source memory runtime for AI agents."
- No client API changes.

## 0.7.0 — first public release as `@statewavedev/sdk`

- Install: `npm install @statewavedev/sdk`
- Import: `import { StatewaveClient } from "@statewavedev/sdk"`
- `publishConfig.{access:"public",provenance:true}` — releases publish with npm provenance attestations
- `exports` adds `./package.json`
- `sideEffects: false`

## 0.6.3 (2026-05-02)

- Package metadata: `homepage` URL now points to https://statewave.ai
- No client API changes

## 0.6.1 (2026-04-29)

- Version bump to align with server v0.6.1 (support-agent intelligence stack)
- Server now supports: resolution tracking, handoff packs, health scoring, SLA tracking, proactive alerts
- SDK convenience methods for new endpoints planned for 0.7.0
- No breaking changes to existing client methods

## 0.5.0 (2026-04-28)

- Async compile support: `compileMemoriesAsync()`, `getCompileStatus()`, `compileMemoriesWait()`
- `CompileJob` type
- SDK retry with exponential backoff on 429/5xx

## 0.4.3 (2026-04-25)

- README updated with batch and subject listing examples
- Automated release workflow (tag-push trigger, CI gate, npm publish with provenance)
- PUBLISHING.md rewritten for automated process
- CI now runs tests (vitest)

## 0.4.0 (2026-04-24)

- Batch episode ingestion (`createEpisodesBatch()`)
- Subject listing (`listSubjects()`)
- `BatchCreateResult`, `SubjectSummary`, `ListSubjectsResult` types
- npm-ready metadata (exports, files, engines, repository)

## 0.3.5 (2026-04-24)

- Auth support (`apiKey` constructor option)
- Multi-tenant support (`tenantId` constructor option)
- Semantic search support (`semantic` param on `searchMemories`)
- Custom exception classes with request-ID propagation
- Full TypeScript types exported

## 0.2.0

- Initial public release
- Fetch-based client with all v1 endpoints
- Full type definitions

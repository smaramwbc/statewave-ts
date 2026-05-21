# Changelog

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

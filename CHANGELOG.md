# Changelog

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

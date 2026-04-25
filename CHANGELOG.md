# Changelog

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

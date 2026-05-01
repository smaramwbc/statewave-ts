# statewave-ts

[![CI](https://github.com/smaramwbc/statewave-ts/workflows/CI/badge.svg)](https://github.com/smaramwbc/statewave-ts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/statewave-ts)](https://www.npmjs.com/package/statewave-ts)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Official TypeScript SDK for [Statewave](https://github.com/smaramwbc/statewave) — memory runtime for AI agents and applications.

> **Part of the Statewave ecosystem:** [Server](https://github.com/smaramwbc/statewave) · [Python SDK](https://github.com/smaramwbc/statewave-py) · **TypeScript SDK** · [Docs](https://github.com/smaramwbc/statewave-docs) · [Examples](https://github.com/smaramwbc/statewave-examples) · [Website + demo](https://statewave.ai)
>
> 📋 **Issues & feature requests:** [statewave/issues](https://github.com/smaramwbc/statewave/issues) (centralized tracker)

## Install

```bash
npm install statewave-ts
```

## Quick start

```typescript
import { StatewaveClient } from "statewave-ts";

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

## Error handling

```typescript
import { StatewaveClient, StatewaveAPIError, StatewaveConnectionError } from "statewave-ts";

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

## Types

All response types are fully typed:

- `Episode` — raw interaction record
- `Memory` — compiled memory with provenance
- `CompileResult` — compilation response
- `SearchResult` — search response
- `ContextBundle` — assembled context with facts, episodes, provenance
- `Timeline` — chronological subject history
- `DeleteResult` — deletion confirmation
- `BatchCreateResult` — batch ingestion response
- `SubjectSummary` — subject with episode/memory counts
- `ListSubjectsResult` — paginated subject listing

Param types: `CreateEpisodeParams`, `SearchMemoriesParams`, `GetContextParams`

## Running tests

```bash
npm install
npm test
```

## License

Apache-2.0

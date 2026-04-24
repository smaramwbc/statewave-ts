# statewave-ts

Official TypeScript SDK for [Statewave](https://github.com/smaramwbc/statewave) — Memory OS for AI agents.

## Install

```bash
npm install statewave-ts
```

## Quick start

```typescript
import { StatewaveClient } from "statewave-ts";

const sw = new StatewaveClient("http://localhost:8100");

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

// Search memories
const facts = await sw.searchMemories({
  subject_id: "user-42",
  kind: "profile_fact",
});

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

Param types: `CreateEpisodeParams`, `SearchMemoriesParams`, `GetContextParams`

## Running tests

```bash
npm install
npm test
```

## License

Apache-2.0

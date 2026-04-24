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
const episode = await sw.createEpisode({
  subject_id: "user-42",
  source: "chat",
  type: "conversation",
  payload: { messages: [{ role: "user", content: "My name is Alice" }] },
});

// Compile memories
const result = await sw.compileMemories("user-42");
console.log(`Created ${result.memories_created} memories`);

// Retrieve context
const ctx = await sw.getContext({ subject_id: "user-42", task: "Help the user" });
console.log(ctx.assembled_context);

// Delete subject data
await sw.deleteSubject("user-42");
```

## License

Apache-2.0

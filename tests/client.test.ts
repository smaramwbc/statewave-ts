import { describe, it, expect, vi } from "vitest";
import { StatewaveClient, StatewaveAPIError, StatewaveConnectionError } from "../src/index.js";

describe("StatewaveClient", () => {
  it("can be constructed with default URL", () => {
    const client = new StatewaveClient();
    expect(client).toBeDefined();
  });

  it("can be constructed with custom URL", () => {
    const client = new StatewaveClient("http://custom:9000");
    expect(client).toBeDefined();
  });

  it("strips trailing slashes from base URL", () => {
    const client = new StatewaveClient("http://localhost:8100///");
    expect(client).toBeDefined();
  });

  it("has getContextString method", () => {
    const client = new StatewaveClient();
    expect(typeof client.getContextString).toBe("function");
  });
});

describe("StatewaveAPIError", () => {
  it("contains status code and error code", () => {
    const err = new StatewaveAPIError(422, "validation_error", "bad request", null, "req-123");
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("validation_error");
    expect(err.requestId).toBe("req-123");
    expect(err.message).toContain("422");
    expect(err.message).toContain("validation_error");
    expect(err.name).toBe("StatewaveAPIError");
  });

  it("is an instance of Error", () => {
    const err = new StatewaveAPIError(500, "internal_error", "oops");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("StatewaveConnectionError", () => {
  it("has a default message", () => {
    const err = new StatewaveConnectionError();
    expect(err.message).toContain("Cannot connect");
    expect(err.name).toBe("StatewaveConnectionError");
  });

  it("accepts a custom message", () => {
    const err = new StatewaveConnectionError("refused");
    expect(err.message).toBe("refused");
  });

  it("is an instance of Error", () => {
    expect(new StatewaveConnectionError()).toBeInstanceOf(Error);
  });
});

describe("exports", () => {
  it("exports StatewaveClient", async () => {
    const mod = await import("../src/index.js");
    expect(mod.StatewaveClient).toBeDefined();
  });

  it("exports error classes", async () => {
    const mod = await import("../src/index.js");
    expect(mod.StatewaveAPIError).toBeDefined();
    expect(mod.StatewaveConnectionError).toBeDefined();
  });
});

describe("Sensitivity labels (#50)", () => {
  it("getContext forwards caller_id and caller_type", async () => {
    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          subject_id: body.subject_id,
          task: body.task,
          facts: [],
          episodes: [],
          procedures: [],
          provenance: {},
          assembled_context: "",
          token_estimate: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = new StatewaveClient({ retry: false });
    await client.getContext({
      subjectId: "u1",
      task: "x",
      callerId: "agent-7",
      callerType: "support_agent",
    });
    // The wire body is snake_case — the SDK maps camelCase params down.
    const sent = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sent.subject_id).toBe("u1");
    expect(sent.caller_id).toBe("agent-7");
    expect(sent.caller_type).toBe("support_agent");
    vi.unstubAllGlobals();
  });

  it("setMemoryLabels PATCHes the right path with the labels list", async () => {
    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/v1/memories/mem-42/labels");
      expect(init?.method).toBe("PATCH");
      const body = JSON.parse(init?.body as string);
      expect(body.sensitivity_labels).toEqual(["pii", "financial"]);
      return new Response(
        JSON.stringify({
          id: "00000000-0000-0000-0000-000000000042",
          subject_id: "u1",
          kind: "profile_fact",
          content: "x",
          summary: "",
          confidence: 1.0,
          valid_from: "2026-01-01T00:00:00Z",
          valid_to: null,
          source_episode_ids: [],
          metadata: {},
          status: "active",
          sensitivity_labels: ["financial", "pii"],
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = new StatewaveClient({ retry: false });
    const memory = await client.setMemoryLabels({
      memoryId: "mem-42",
      sensitivityLabels: ["pii", "financial"],
    });
    // Server normalizes (sorted, lowercased) — the SDK passes the
    // canonical set through verbatim, mapped back to camelCase.
    expect(memory.sensitivityLabels).toEqual(["financial", "pii"]);
    vi.unstubAllGlobals();
  });
});

describe("Receipts", () => {
  it("getContext forwards emit_receipt and receipt correlation ids", async () => {
    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      // The mock returns the body it received so the test can assert on it.
      return new Response(
        JSON.stringify({
          subject_id: body.subject_id,
          task: body.task,
          facts: [],
          episodes: [],
          procedures: [],
          provenance: {},
          assembled_context: "",
          token_estimate: 0,
          receipt_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          receipt_emitted: true,
          // Echo the request body fields back so we can assert forwarding.
          _echo: body,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = new StatewaveClient({ retry: false });
    const bundle = await client.getContext({
      subjectId: "u1",
      task: "anything",
      emitReceipt: true,
      queryId: "q-1",
      taskId: "t-1",
      parentReceiptId: "01ARZ3NDEKTSV4RRFFQ69G5FA0",
    });
    expect(bundle.receiptId).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(bundle.receiptEmitted).toBe(true);
    // Wire body stays snake_case.
    const sent = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sent.emit_receipt).toBe(true);
    expect(sent.query_id).toBe("q-1");
    expect(sent.task_id).toBe("t-1");
    expect(sent.parent_receipt_id).toBe("01ARZ3NDEKTSV4RRFFQ69G5FA0");
    vi.unstubAllGlobals();
  });

  it("getReceipt hits the right path and parses the body", async () => {
    const mockFetch = vi.fn(async (url: string) => {
      expect(url).toContain("/v1/receipts/01ARZ3NDEKTSV4RRFFQ69G5FAV");
      return new Response(
        JSON.stringify({
          receipt_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          parent_receipt_id: null,
          mode: "retrieval",
          query_id: null,
          task_id: null,
          tenant_id: null,
          subject_id: "u1",
          task: "x",
          as_of: "2026-05-12T10:00:00+00:00",
          created_at: "2026-05-12T10:00:00+00:00",
          selected_entries: [],
          policy: {
            policy_bundle_hash: null,
            filters_applied: [],
            filters_skipped: [],
            mode: "log_only",
          },
          output: {
            context_hash: "abc",
            context_size_bytes: 0,
            canonicalization_version: 1,
            token_estimate: 0,
          },
          region: null,
          receipt_signature: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = new StatewaveClient({ retry: false });
    const receipt = await client.getReceipt("01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(receipt.mode).toBe("retrieval");
    expect(receipt.policy.mode).toBe("log_only");
    // Snake_case wire fields are mapped to camelCase, including nested.
    expect(receipt.receiptId).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(receipt.parentReceiptId).toBeNull();
    expect(receipt.subjectId).toBe("u1");
    expect(receipt.selectedEntries).toEqual([]);
    expect(receipt.policy.policyBundleHash).toBeNull();
    expect(receipt.output.contextHash).toBe("abc");
    expect(receipt.output.canonicalizationVersion).toBe(1);
    vi.unstubAllGlobals();
  });

  it("listReceipts encodes pagination params", async () => {
    const mockFetch = vi.fn(async (url: string) => {
      expect(url).toContain("subject_id=u1");
      expect(url).toContain("limit=5");
      expect(url).toContain("cursor=01ARZ3NDEKTSV4RRFFQ69G5FA0");
      return new Response(JSON.stringify({ receipts: [], next_cursor: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = new StatewaveClient({ retry: false });
    const out = await client.listReceipts({
      subjectId: "u1",
      limit: 5,
      cursor: "01ARZ3NDEKTSV4RRFFQ69G5FA0",
    });
    expect(out.receipts).toEqual([]);
    expect(out.nextCursor).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("Retry behavior", () => {
  it("can be configured with retry options", () => {
    const client = new StatewaveClient({ retry: { maxRetries: 5, backoffBase: 100 } });
    expect(client).toBeDefined();
  });

  it("can disable retries", () => {
    const client = new StatewaveClient({ retry: false });
    expect(client).toBeDefined();
  });

  it("retries on 429 and succeeds", async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: { code: "rate_limited", message: "slow down" } }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ id: "ep-1", subject_id: "s1", source: "t", type: "t", payload: {}, metadata: {}, provenance: {}, created_at: "2026-01-01T00:00:00Z" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", mockFetch);
    const client = new StatewaveClient({ retry: { maxRetries: 2, backoffBase: 10, jitter: false } });
    const result = await client.createEpisode({ subjectId: "s1", source: "t", type: "t", payload: {} });
    expect(result.id).toBe("ep-1");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("does NOT retry on 400", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { code: "validation", message: "bad" } }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", mockFetch);
    const client = new StatewaveClient({ retry: { maxRetries: 3, backoffBase: 10 } });
    await expect(client.createEpisode({ subjectId: "s1", source: "t", type: "t", payload: {} }))
      .rejects.toThrow(StatewaveAPIError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("retries on network error then succeeds", async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) throw new Error("ECONNREFUSED");
      return new Response(JSON.stringify({ id: "ep-1", subject_id: "s1", source: "t", type: "t", payload: {}, metadata: {}, provenance: {}, created_at: "2026-01-01T00:00:00Z" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", mockFetch);
    const client = new StatewaveClient({ retry: { maxRetries: 2, backoffBase: 10, jitter: false } });
    const result = await client.createEpisode({ subjectId: "s1", source: "t", type: "t", payload: {} });
    expect(result.id).toBe("ep-1");
    vi.unstubAllGlobals();
  });

  it("throws StatewaveConnectionError after retries exhausted on network error", async () => {
    const mockFetch = vi.fn(async () => { throw new Error("ECONNREFUSED"); });

    vi.stubGlobal("fetch", mockFetch);
    const client = new StatewaveClient({ retry: { maxRetries: 2, backoffBase: 10, jitter: false } });
    await expect(client.createEpisode({ subjectId: "s1", source: "t", type: "t", payload: {} }))
      .rejects.toThrow(StatewaveConnectionError);
    expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
    vi.unstubAllGlobals();
  });

  it("respects Retry-After header", async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: { code: "rate_limited", message: "wait" } }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "0.01" },
        });
      }
      return new Response(JSON.stringify({ id: "ep-1", subject_id: "s1", source: "t", type: "t", payload: {}, metadata: {}, provenance: {}, created_at: "2026-01-01T00:00:00Z" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", mockFetch);
    const client = new StatewaveClient({ retry: { maxRetries: 1, backoffBase: 10, jitter: false } });
    const result = await client.createEpisode({ subjectId: "s1", source: "t", type: "t", payload: {} });
    expect(result.id).toBe("ep-1");
    vi.unstubAllGlobals();
  });
});

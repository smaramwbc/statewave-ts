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
    const result = await client.createEpisode({ subject_id: "s1", source: "t", type: "t", payload: {} });
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
    await expect(client.createEpisode({ subject_id: "s1", source: "t", type: "t", payload: {} }))
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
    const result = await client.createEpisode({ subject_id: "s1", source: "t", type: "t", payload: {} });
    expect(result.id).toBe("ep-1");
    vi.unstubAllGlobals();
  });

  it("throws StatewaveConnectionError after retries exhausted on network error", async () => {
    const mockFetch = vi.fn(async () => { throw new Error("ECONNREFUSED"); });

    vi.stubGlobal("fetch", mockFetch);
    const client = new StatewaveClient({ retry: { maxRetries: 2, backoffBase: 10, jitter: false } });
    await expect(client.createEpisode({ subject_id: "s1", source: "t", type: "t", payload: {} }))
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
    const result = await client.createEpisode({ subject_id: "s1", source: "t", type: "t", payload: {} });
    expect(result.id).toBe("ep-1");
    vi.unstubAllGlobals();
  });
});

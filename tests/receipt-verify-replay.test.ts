/**
 * Tests for the v0.9 receipt-governance SDK helpers — verifyReceipt
 * + replayReceipt + StatewaveUnreplayableError mapping.
 *
 * Wire payloads here mirror the server responses exactly (snake_case,
 * canonical `error.code = unreplayable.<reason>` envelope on 422).
 */
import { describe, it, expect, vi } from "vitest";
import {
  StatewaveClient,
  StatewaveAPIError,
  StatewaveUnreplayableError,
} from "../src/index.js";
import type {
  ReceiptVerifyResult,
  ReceiptReplayResult,
  UnreplayableReason,
} from "../src/types.js";

// ─── Representative wire payloads — match server response shapes ─────────

const VERIFY_OK = {
  valid: true,
  key_id: "key-2026-01",
  algorithm: "hmac-sha256-canonical-v1",
  reason: "ok",
};

const VERIFY_NO_SIGNATURE = {
  valid: null,
  key_id: null,
  algorithm: null,
  reason: "no_signature",
};

const VERIFY_KEY_UNAVAILABLE = {
  valid: null,
  key_id: "key-2025-12",
  algorithm: "hmac-sha256-canonical-v1",
  reason: "key_unavailable",
};

const VERIFY_MISMATCH = {
  valid: false,
  key_id: "key-2026-01",
  algorithm: "hmac-sha256-canonical-v1",
  reason: "signature_mismatch",
};

const REPLAY_OK = {
  original_receipt_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  replay_receipt_id: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
  diff: {
    context_hash: {
      original: "a".repeat(64),
      replay: "b".repeat(64),
      changed: true,
    },
    selected_entries: {
      added: [
        {
          type: "memory",
          memory_id: "00000000-0000-0000-0000-000000000002",
          rank: 1,
        },
      ],
      removed: [],
      common: 3,
    },
    filters_applied: { added: [], removed: [] },
  },
};

const REPLAY_WRITE_FAILED = {
  // The replay-receipt write itself failed (rare, fail-open). The
  // diff envelope is still authoritative; replayReceiptId is null
  // and the original entries appear under `removed`.
  original_receipt_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  replay_receipt_id: null,
  diff: {
    context_hash: { original: "a".repeat(64), replay: null, changed: true },
    selected_entries: {
      added: [],
      removed: [{ type: "memory", memory_id: "m1", rank: 1 }],
      common: 0,
    },
    filters_applied: { added: [], removed: [] },
  },
};

function unreplayableBody(reason: string) {
  return {
    error: {
      code: `unreplayable.${reason}`,
      message: `receipt is unreplayable: ${reason}`,
      details: null,
      request_id: "test-req-id",
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── verifyReceipt — happy + each reason cell ────────────────────────────

describe("verifyReceipt", () => {
  it("returns valid:true for an OK signature", async () => {
    const mockFetch = vi.fn(async (url: string) => {
      expect(url).toContain("/v1/receipts/01ARZ3NDEKTSV4RRFFQ69G5FAV/verify");
      return jsonResponse(200, VERIFY_OK);
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = new StatewaveClient();
    const result: ReceiptVerifyResult = await client.verifyReceipt(
      "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    );
    expect(result.valid).toBe(true);
    expect(result.reason).toBe("ok");
    expect(result.keyId).toBe("key-2026-01");
    expect(result.algorithm).toBe("hmac-sha256-canonical-v1");
    vi.unstubAllGlobals();
  });

  it("returns valid:null + reason:no_signature for pre-v0.9 receipts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, VERIFY_NO_SIGNATURE)));
    const client = new StatewaveClient();
    const result = await client.verifyReceipt("01ARZ3...");
    expect(result.valid).toBeNull();
    expect(result.reason).toBe("no_signature");
    expect(result.keyId).toBeNull();
    expect(result.algorithm).toBeNull();
    vi.unstubAllGlobals();
  });

  it("returns valid:null + reason:key_unavailable when key rotated out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, VERIFY_KEY_UNAVAILABLE)));
    const client = new StatewaveClient();
    const result = await client.verifyReceipt("01ARZ3...");
    expect(result.valid).toBeNull();
    expect(result.reason).toBe("key_unavailable");
    expect(result.keyId).toBe("key-2025-12");
    vi.unstubAllGlobals();
  });

  it("returns valid:false for a signature mismatch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, VERIFY_MISMATCH)));
    const client = new StatewaveClient();
    const result = await client.verifyReceipt("01ARZ3...");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
    vi.unstubAllGlobals();
  });

  it("URL-encodes the receipt id", async () => {
    let capturedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        capturedUrl = url;
        return jsonResponse(200, VERIFY_OK);
      }),
    );
    const client = new StatewaveClient();
    await client.verifyReceipt("weird/id with spaces");
    expect(capturedUrl).toContain("weird%2Fid%20with%20spaces");
    vi.unstubAllGlobals();
  });
});

// ─── replayReceipt — happy + each refusal code ───────────────────────────

describe("replayReceipt", () => {
  it("returns the diff envelope on success", async () => {
    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/v1/receipts/01ARZ3NDEKTSV4RRFFQ69G5FAV/replay");
      expect(init?.method).toBe("POST");
      return jsonResponse(200, REPLAY_OK);
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = new StatewaveClient();
    const result: ReceiptReplayResult = await client.replayReceipt(
      "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    );
    expect(result.originalReceiptId).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(result.replayReceiptId).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAW");
    expect(result.diff.contextHash.changed).toBe(true);
    expect(result.diff.selectedEntries.added.length).toBe(1);
    expect(result.diff.selectedEntries.common).toBe(3);
    vi.unstubAllGlobals();
  });

  it("tolerates a null replayReceiptId (fail-open write path)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, REPLAY_WRITE_FAILED)));
    const client = new StatewaveClient();
    const result = await client.replayReceipt("01ARZ3...");
    expect(result.replayReceiptId).toBeNull();
    expect(result.diff.contextHash.original).toBe("a".repeat(64));
    expect(result.diff.contextHash.replay).toBeNull();
    expect(result.diff.selectedEntries.removed.length).toBe(1);
    vi.unstubAllGlobals();
  });

  it.each([
    "missing_policy_snapshot",
    "nested_replay",
    "invalid_snapshot",
  ] as UnreplayableReason[])(
    "promotes 422 unreplayable.%s to StatewaveUnreplayableError",
    async (reason) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(422, unreplayableBody(reason))),
      );
      const client = new StatewaveClient({ retry: false });

      let caught: unknown;
      try {
        await client.replayReceipt("01ARZ3...");
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(StatewaveUnreplayableError);
      expect(caught).toBeInstanceOf(StatewaveAPIError); // subclass — generic catches still work
      const err = caught as StatewaveUnreplayableError;
      expect(err.reason).toBe(reason);
      expect(err.code).toBe(`unreplayable.${reason}`);
      expect(err.statusCode).toBe(422);
      expect(err.requestId).toBe("test-req-id");
      vi.unstubAllGlobals();
    },
  );

  it("preserves an unknown unreplayable.* reason as a generic StatewaveAPIError", async () => {
    // Forward-compat: a future server might add a new refusal code we
    // haven't learned yet. The SDK should not crash and should not
    // mis-cast it to StatewaveUnreplayableError.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(422, {
          error: {
            code: "unreplayable.brand_new_reason",
            message: "future reason",
            request_id: "x",
          },
        }),
      ),
    );
    const client = new StatewaveClient({ retry: false });

    let caught: unknown;
    try {
      await client.replayReceipt("01ARZ3...");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(StatewaveAPIError);
    expect(caught).not.toBeInstanceOf(StatewaveUnreplayableError);
    const err = caught as StatewaveAPIError;
    expect(err.code).toBe("unreplayable.brand_new_reason");
    vi.unstubAllGlobals();
  });

  it("404 stays a plain StatewaveAPIError (not unreplayable)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(404, {
          error: { code: "not_found", message: "receipt not found" },
        }),
      ),
    );
    const client = new StatewaveClient({ retry: false });

    let caught: unknown;
    try {
      await client.replayReceipt("01ARZ3...");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(StatewaveAPIError);
    expect(caught).not.toBeInstanceOf(StatewaveUnreplayableError);
    const err = caught as StatewaveAPIError;
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("not_found");
    vi.unstubAllGlobals();
  });

  it("URL-encodes the receipt id", async () => {
    let capturedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        capturedUrl = url;
        return jsonResponse(200, REPLAY_OK);
      }),
    );
    const client = new StatewaveClient();
    await client.replayReceipt("weird/id with spaces");
    expect(capturedUrl).toContain("weird%2Fid%20with%20spaces");
    vi.unstubAllGlobals();
  });
});

// ─── Receipt type absorbs v0.9 governance fields ─────────────────────────

describe("Receipt type completeness", () => {
  it("absorbs a v0.9 signed receipt with policy_snapshot from /v1/receipts/{id}", async () => {
    // Without v0.10.1's type completion, the new fields would not
    // be visible on the strongly-typed Receipt and pre-v0.10.1
    // clients hitting v0.9.1+ servers would silently drop them.
    const wireBody = {
      receipt_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      parent_receipt_id: null,
      mode: "as_of_replay",
      query_id: null,
      task_id: null,
      tenant_id: "acme",
      subject_id: "user-42",
      task: "replay test",
      as_of: "2026-05-26T18:00:00+00:00",
      created_at: "2026-05-26T18:00:00+00:00",
      selected_entries: [],
      policy: { policy_bundle_hash: null, filters_applied: [], filters_skipped: [], mode: "log_only" },
      output: { context_hash: "x".repeat(64), context_size_bytes: 0, canonicalization_version: 1, token_estimate: 0 },
      region: "eu",
      receipt_signature: "abc123",
      receipt_signature_key_id: "key-2026-01",
      receipt_signature_algorithm: "hmac-sha256-canonical-v1",
      policy_snapshot: {
        bundle_hash: "snap-abc",
        bundle_yaml: "version: 1\nrules: []\n",
        captured_at: "2026-05-26T17:59:00+00:00",
      },
    };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, wireBody)));
    const client = new StatewaveClient();
    const r = await client.getReceipt("01ARZ3NDEKTSV4RRFFQ69G5FAV");

    expect(r.mode).toBe("as_of_replay");
    expect(r.region).toBe("eu");
    expect(r.receiptSignatureKeyId).toBe("key-2026-01");
    expect(r.receiptSignatureAlgorithm).toBe("hmac-sha256-canonical-v1");
    expect(r.policySnapshot).not.toBeNull();
    expect(r.policySnapshot?.bundleYaml).toContain("version: 1");
    expect(r.policySnapshot?.capturedAt).toBe("2026-05-26T17:59:00+00:00");
    vi.unstubAllGlobals();
  });

  it("pre-v0.9 receipt (no signature / no snapshot) still validates", async () => {
    const wireBody = {
      receipt_id: "01ARZ3NDEKTSV4RRFFQ69G5FAU",
      parent_receipt_id: null,
      mode: "retrieval",
      query_id: null,
      task_id: null,
      tenant_id: null,
      subject_id: "user-42",
      task: "old query",
      as_of: "2026-05-12T10:00:00+00:00",
      created_at: "2026-05-12T10:00:00+00:00",
      selected_entries: [],
      policy: { policy_bundle_hash: null, filters_applied: [], filters_skipped: [], mode: "log_only" },
      output: { context_hash: "y".repeat(64), context_size_bytes: 0, canonicalization_version: 1, token_estimate: 0 },
      region: null,
      receipt_signature: null,
    };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, wireBody)));
    const client = new StatewaveClient();
    const r = await client.getReceipt("01ARZ3...");
    expect(r.mode).toBe("retrieval");
    expect(r.receiptSignature).toBeNull();
    // Pre-v0.9 receipts may have these missing on the wire entirely;
    // the strong type tolerates both `null` and `undefined` via the
    // optional `?` on the field.
    expect(r.policySnapshot ?? null).toBeNull();
    vi.unstubAllGlobals();
  });
});

// ─── StatewaveUnreplayableError shape ────────────────────────────────────

describe("StatewaveUnreplayableError", () => {
  it("carries the structured reason and is catchable as StatewaveAPIError", () => {
    const err = new StatewaveUnreplayableError(
      "missing_policy_snapshot",
      422,
      "unreplayable.missing_policy_snapshot",
      "pre-v0.9 receipt — no snapshot was captured",
      null,
      "req-abc",
    );
    expect(err.reason).toBe("missing_policy_snapshot");
    expect(err.code).toBe("unreplayable.missing_policy_snapshot");
    expect(err.statusCode).toBe(422);
    expect(err.requestId).toBe("req-abc");
    expect(err.name).toBe("StatewaveUnreplayableError");
    expect(err).toBeInstanceOf(StatewaveAPIError);
    expect(err).toBeInstanceOf(Error);
  });
});

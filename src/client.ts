import type {
  BatchCreateResult,
  ClientOptions,
  CompileJob,
  CompileResult,
  ContextBundle,
  CreateEpisodeParams,
  CreateHandoffParams,
  CreateResolutionParams,
  DeleteResult,
  Episode,
  GetContextParams,
  GetSLAParams,
  Handoff,
  Health,
  ListReceiptsParams,
  ListResolutionsParams,
  ListSubjectsResult,
  Memory,
  Receipt,
  ReceiptList,
  ReceiptReplayResult,
  ReceiptVerifyResult,
  Resolution,
  RetryConfig,
  SLASummary,
  SearchMemoriesParams,
  SearchResult,
  SetMemoryLabelsParams,
  Timeline,
  UnreplayableReason,
} from "./types.js";

/**
 * Free-form bags whose contents are user-owned. Their *inner* keys are
 * never rewritten in either direction so arbitrary caller data (which
 * may itself contain snake_case or camelCase keys) round-trips
 * byte-for-byte. The key names themselves are single words, so they are
 * unchanged by case conversion regardless.
 */
const OPAQUE_KEYS = new Set(["payload", "metadata", "provenance"]);

function snakeKeyToCamel(key: string): string {
  return key.replace(/_+([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase());
}

function camelKeyToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function mapKeys(value: unknown, convert: (k: string) => string): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => mapKeys(v, convert));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // Opaque bag: keep the verbatim value, don't recurse into it.
      out[convert(k)] = OPAQUE_KEYS.has(k) ? v : mapKeys(v, convert);
    }
    return out;
  }
  return value;
}

/** Wire (snake_case) → public SDK shape (camelCase). */
function fromWire<T>(value: unknown): T {
  return mapKeys(value, snakeKeyToCamel) as T;
}

/** Public SDK shape (camelCase) → wire (snake_case). */
function toWire(value: unknown): unknown {
  return mapKeys(value, camelKeyToSnake);
}

/** Structured error from the Statewave API. */
export class StatewaveAPIError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(statusCode: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(`[${statusCode}] ${code}: ${message}`);
    this.name = "StatewaveAPIError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

/** Raised when the SDK cannot reach the Statewave server. */
export class StatewaveConnectionError extends Error {
  constructor(message = "Cannot connect to Statewave server") {
    super(message);
    this.name = "StatewaveConnectionError";
  }
}

/** The documented refusal vocabulary for the v0.9 replay endpoint.
 *  Mirrors the `UnreplayableReason` type alias in `./types.ts`.
 *  Auto-promotion to `StatewaveUnreplayableError` only happens when
 *  the server returns a code with one of these reasons — a future
 *  unknown reason stays on the generic `StatewaveAPIError` path. */
const UNREPLAYABLE_REASONS: ReadonlySet<string> = new Set([
  "missing_policy_snapshot",
  "nested_replay",
  "invalid_snapshot",
]);

/**
 * Raised by `replayReceipt(...)` when the server refuses with HTTP 422.
 * Subclass of `StatewaveAPIError` so generic handlers still catch it;
 * adds a typed `reason` field so callers can branch on the structured
 * refusal vocabulary without parsing the error code.
 *
 * `reason` is a discriminated union of:
 * - `"missing_policy_snapshot"` — pre-v0.9 receipt. No
 *   `policySnapshot` was captured at emission and the replay engine
 *   cannot synthesise one retroactively.
 * - `"nested_replay"` — the receipt is itself a replay
 *   (`mode === "as_of_replay"`). v0.9 ships one level only; replay
 *   the source receipt referenced by `parentReceiptId` instead.
 * - `"invalid_snapshot"` — the snapshot's YAML failed to parse.
 *   Tampering or corruption at the column level.
 */
export class StatewaveUnreplayableError extends StatewaveAPIError {
  readonly reason: UnreplayableReason;

  constructor(
    reason: UnreplayableReason,
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
    requestId?: string,
  ) {
    super(statusCode, code, message, details, requestId);
    this.name = "StatewaveUnreplayableError";
    this.reason = reason;
  }
}

/** Per-call options accepted by every public HTTP method. */
export interface RequestOptions {
  /**
   * An `AbortSignal` for cancelling the request. When the signal fires,
   * the underlying `fetch()` call is aborted immediately and the SDK
   * re-throws the `AbortError` without retrying.
   *
   * On the React layer this should be combined with stale-response
   * guards (e.g. ignoring responses whose request ID no longer matches
   * the current render cycle) because the signal cancels the *network*
   * call but cannot unwind code that has already returned.
   */
  signal?: AbortSignal;
}

export class StatewaveClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private retryConfig: Required<RetryConfig>;

  /**
   * Create a Statewave client.
   *
   * @param options - A base-URL string, or a {@link ClientOptions} object
   *   with `baseUrl`, optional `apiKey` / `tenantId`, and optional `retry`
   *   config. Defaults to `http://localhost:8100`; trailing slashes are trimmed.
   * @example
   * const sw = new StatewaveClient({ baseUrl: "http://localhost:8100", apiKey: "sk-…" });
   */
  constructor(options: ClientOptions | string = "http://localhost:8100") {
    const opts = typeof options === "string" ? { baseUrl: options } : options;
    const rawBaseUrl = opts.baseUrl ?? "http://localhost:8100";
    let end = rawBaseUrl.length;
    while (end > 0 && rawBaseUrl[end - 1] === "/") end--;
    this.baseUrl = rawBaseUrl.slice(0, end);
    this.defaultHeaders = {};
    if (opts.apiKey) this.defaultHeaders["X-API-Key"] = opts.apiKey;
    if (opts.tenantId) this.defaultHeaders["X-Tenant-ID"] = opts.tenantId;

    const retry = opts.retry === false ? { maxRetries: 0 } : (opts.retry ?? {});
    this.retryConfig = {
      maxRetries: retry.maxRetries ?? 3,
      backoffBase: retry.backoffBase ?? 500,
      backoffMax: retry.backoffMax ?? 30_000,
      jitter: retry.jitter ?? true,
      retryOnStatus: retry.retryOnStatus ?? [429, 500, 502, 503, 504],
    };
  }

  /**
   * Ingest a single immutable episode (a raw event) for a subject.
   *
   * @param params - Subject id, `source`, `type`, `payload`, and optional
   *   `metadata` / `provenance` / `sessionId`.
   * @param options - Optional per-call options including `signal`.
   * @returns The created {@link Episode}.
   * @throws {StatewaveAPIError} On a non-2xx response (e.g. validation).
   * @throws {StatewaveConnectionError} If the server is unreachable.
   * @example
   * await sw.createEpisode({ subjectId: "user:42", source: "chat", type: "message", payload: { text: "hi" } });
   */
  async createEpisode(params: CreateEpisodeParams, options?: RequestOptions): Promise<Episode> {
    // `sessionId` is declared on the type but was silently dropped on the
    // wire before v1.0.0 (fix prepared as the unreleased 0.10.2) — forward
    // it conditionally so the published contract matches the server's
    // CreateEpisodeRequest schema (see statewave#174). Omitted when undefined
    // so the wire shape stays byte-for-byte unchanged for callers that don't
    // set it.
    const body: Record<string, unknown> = {
      subjectId: params.subjectId,
      source: params.source,
      type: params.type,
      payload: params.payload,
      metadata: params.metadata ?? {},
      provenance: params.provenance ?? {},
    };
    if (params.sessionId !== undefined) body.sessionId = params.sessionId;
    if (params.idempotencyKey !== undefined) body.idempotencyKey = params.idempotencyKey;
    return this.post("/v1/episodes", body, options?.signal);
  }

  /**
   * Ingest up to 100 episodes in one request.
   *
   * @param episodes - Array of {@link CreateEpisodeParams} (same shape as
   *   {@link StatewaveClient.createEpisode}).
   * @param options - Optional per-call options including `signal`.
   * @returns A {@link BatchCreateResult} with per-item outcomes.
   * @throws {StatewaveAPIError} On a non-2xx response.
   * @throws {StatewaveConnectionError} If the server is unreachable.
   * @example
   * await sw.createEpisodesBatch([{ subjectId: "user:42", source: "chat", type: "message", payload: { text: "a" } }]);
   */
  async createEpisodesBatch(episodes: CreateEpisodeParams[], options?: RequestOptions): Promise<BatchCreateResult> {
    return this.post("/v1/episodes/batch", { episodes: episodes.map(e => {
      const item: Record<string, unknown> = {
        subjectId: e.subjectId,
        source: e.source,
        type: e.type,
        payload: e.payload,
        metadata: e.metadata ?? {},
        provenance: e.provenance ?? {},
      };
      if (e.sessionId !== undefined) item.sessionId = e.sessionId;
      if (e.idempotencyKey !== undefined) item.idempotencyKey = e.idempotencyKey;
      return item;
    })}, options?.signal);
  }

  /**
   * Compile a subject's raw episodes into typed, ranked memories
   * (synchronous — waits for the compile to finish).
   *
   * @param subjectId - The subject to compile.
   * @param options - Optional per-call options including `signal`.
   * @returns A {@link CompileResult} summarising what was produced.
   * @throws {StatewaveAPIError} On a non-2xx response.
   * @throws {StatewaveConnectionError} If the server is unreachable.
   * @example
   * await sw.compileMemories("user:42");
   */
  async compileMemories(subjectId: string, options?: RequestOptions): Promise<CompileResult> {
    return this.post("/v1/memories/compile", { subjectId }, options?.signal);
  }

  /**
   * Submit compilation as a background job — returns immediately.
   *
   * @param subjectId - The subject to compile.
   * @param options - Optional per-call options including `signal`.
   * @returns A {@link CompileJob} whose `jobId` you can poll with
   *   {@link StatewaveClient.getCompileStatus}.
   * @throws {StatewaveAPIError} On a non-2xx response.
   * @example
   * const job = await sw.compileMemoriesAsync("user:42");
   */
  async compileMemoriesAsync(subjectId: string, options?: RequestOptions): Promise<CompileJob> {
    return this.post("/v1/memories/compile", { subjectId, async: true }, options?.signal);
  }

  /**
   * Poll the status of an async compile job.
   *
   * @param jobId - The `jobId` from {@link StatewaveClient.compileMemoriesAsync}.
   * @param options - Optional per-call options including `signal`.
   * @returns The {@link CompileJob} with its current `status`.
   * @throws {StatewaveAPIError} On a non-2xx response (e.g. unknown job).
   * @example
   * const job = await sw.getCompileStatus(jobId);
   */
  async getCompileStatus(jobId: string, options?: RequestOptions): Promise<CompileJob> {
    return this.get(`/v1/memories/compile/${encodeURIComponent(jobId)}`, options?.signal);
  }

  /**
   * Submit async compilation and poll until it reaches a terminal state.
   *
   * @param subjectId - The subject to compile.
   * @param options - Optional `pollInterval` (ms, default 500), `timeout`
   *   (ms, default 60000), and `signal` for cooperative cancellation.
   * @returns The terminal {@link CompileJob} (`completed` or `failed`).
   * @throws {Error} If the job does not finish within `timeout`.
   * @throws {StatewaveAPIError} On a non-2xx response.
   * @example
   * const job = await sw.compileMemoriesWait("user:42", { timeout: 30_000 });
   */
  async compileMemoriesWait(
    subjectId: string,
    options?: { pollInterval?: number; timeout?: number; signal?: AbortSignal }
  ): Promise<CompileJob> {
    const pollInterval = options?.pollInterval ?? 500;
    const timeout = options?.timeout ?? 60_000;
    const signal = options?.signal;

    const job = await this.compileMemoriesAsync(subjectId, { signal });
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await this.sleep(pollInterval, signal);
      const status = await this.getCompileStatus(job.jobId, { signal });
      if (status.status === "completed" || status.status === "failed") {
        return status;
      }
    }
    throw new Error(`Compile job ${job.jobId} did not complete within ${timeout}ms`);
  }

  /**
   * Search a subject's compiled memories — lexical by default, or semantic
   * when `semantic: true` (requires a real embedding provider).
   *
   * @param params - `subjectId` plus optional `kind`, `query`, `semantic`,
   *   and `limit`.
   * @param options - Optional per-call options including `signal`.
   * @returns A {@link SearchResult}.
   * @throws {StatewaveAPIError} On a non-2xx response.
   * @example
   * await sw.searchMemories({ subjectId: "user:42", query: "plan tier", semantic: true });
   */
  async searchMemories(params: SearchMemoriesParams, options?: RequestOptions): Promise<SearchResult> {
    const qs = new URLSearchParams({ subject_id: params.subjectId });
    if (params.kind) qs.set("kind", params.kind);
    if (params.query) qs.set("q", params.query);
    if (params.semantic) qs.set("semantic", "true");
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    return this.get(`/v1/memories/search?${qs}`, options?.signal);
  }

  /**
   * Assemble a ranked, token-bounded context bundle for a subject + task.
   * Deterministic: the same `(subjectId, task, maxTokens)` returns the same
   * bundle. Pass `emitReceipt: true` to emit a state-assembly receipt.
   *
   * @param params - `subjectId`, `task`, and optional `maxTokens`,
   *   `sessionId`, `emitReceipt`, `queryId`, `taskId`, `parentReceiptId`,
   *   `callerId`, `callerType`.
   * @param options - Optional per-call options including `signal`.
   * @returns A {@link ContextBundle} (`assembledContext`, `facts`,
   *   `tokenEstimate`, `provenance`).
   * @throws {StatewaveAPIError} On a non-2xx response (e.g. 401 when the
   *   tenant requires caller identity).
   * @example
   * const bundle = await sw.getContext({ subjectId: "user:42", task: question, maxTokens: 2000 });
   */
  async getContext(params: GetContextParams, options?: RequestOptions): Promise<ContextBundle> {
    return this.post("/v1/context", {
      subjectId: params.subjectId,
      task: params.task,
      ...(params.maxTokens !== undefined && { maxTokens: params.maxTokens }),
      ...(params.sessionId !== undefined && { sessionId: params.sessionId }),
      ...(params.emitReceipt !== undefined && { emitReceipt: params.emitReceipt }),
      ...(params.queryId !== undefined && { queryId: params.queryId }),
      ...(params.taskId !== undefined && { taskId: params.taskId }),
      ...(params.parentReceiptId !== undefined && {
        parentReceiptId: params.parentReceiptId,
      }),
      ...(params.callerId !== undefined && { callerId: params.callerId }),
      ...(params.callerType !== undefined && { callerType: params.callerType }),
    }, options?.signal);
  }

  // -- Memory labels (#50) ----------------------------------------------

  /**
   * Replace a memory's sensitivityLabels. Server normalizes
   * (dedup + lowercase + trim) and caps at 32 entries. Empty array
   * clears all labels — the memory becomes untagged and any policy
   * rule that depends on a label match falls through to default-allow.
   */
  async setMemoryLabels(params: SetMemoryLabelsParams, options?: RequestOptions): Promise<Memory> {
    return this.request(
      "PATCH",
      `/v1/memories/${encodeURIComponent(params.memoryId)}/labels`,
      { sensitivityLabels: params.sensitivityLabels },
      options?.signal,
    );
  }

  /**
   * Convenience wrapper over {@link StatewaveClient.getContext} that returns
   * only the `assembledContext` string, ready to inject into a prompt.
   *
   * @param params - Same as {@link StatewaveClient.getContext}.
   * @param options - Optional per-call options including `signal`.
   * @returns The assembled context string.
   * @throws {StatewaveAPIError} On a non-2xx response.
   * @example
   * const ctx = await sw.getContextString({ subjectId: "user:42", task: question, maxTokens: 2000 });
   */
  async getContextString(params: GetContextParams, options?: RequestOptions): Promise<string> {
    const bundle = await this.getContext(params, options);
    return bundle.assembledContext;
  }

  // -- Receipts --------------------------------------------------------

  /**
   * Fetch a single state-assembly receipt by its ULID.
   *
   * @param receiptId - The receipt ULID.
   * @param options - Optional per-call options including `signal`.
   * @returns The {@link Receipt}.
   * @throws {StatewaveAPIError} On 404 (not found / different tenant) or
   *   other non-2xx responses.
   * @example
   * const receipt = await sw.getReceipt("01J…");
   */
  async getReceipt(receiptId: string, options?: RequestOptions): Promise<Receipt> {
    return this.get(`/v1/receipts/${encodeURIComponent(receiptId)}`, options?.signal);
  }

  /**
   * List state-assembly receipts for a subject, newest first.
   * Cursor-paginated — pass back the previous response's `nextCursor`
   * to fetch the next page.
   */
  async listReceipts(params: ListReceiptsParams, options?: RequestOptions): Promise<ReceiptList> {
    const qs = new URLSearchParams({ subject_id: params.subjectId });
    if (params.since !== undefined) qs.set("since", params.since);
    if (params.until !== undefined) qs.set("until", params.until);
    if (params.cursor !== undefined) qs.set("cursor", params.cursor);
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    return this.get(`/v1/receipts?${qs}`, options?.signal);
  }

  /**
   * Verify the HMAC signature on a stored receipt (v0.9+ #157).
   *
   * Returns a `ReceiptVerifyResult` with `valid` ∈ `{true, false, null}`:
   * - `true` — signature matches the canonical body (`reason === "ok"`).
   * - `false` — signature does not cover the body
   *   (`reason === "signature_mismatch"`).
   * - `null` — verdict could not be determined; `reason` is one of
   *   `"no_signature"` (unsigned receipt — pre-v0.9 or tenant didn't
   *   opt in), `"key_unavailable"` (the keyId rotated out of operator
   *   config), or `"unsupported_algorithm"` (forward-compat).
   *
   * Comparison is constant-time on the server side. The signing key
   * bytes never appear on the response — only the public `keyId` is
   * echoed.
   *
   * Throws `StatewaveAPIError` on 404 (receipt not found or belongs to
   * a different tenant — indistinguishable on the wire) and other
   * non-2xx responses.
   */
  async verifyReceipt(receiptId: string, options?: RequestOptions): Promise<ReceiptVerifyResult> {
    return this.get(`/v1/receipts/${encodeURIComponent(receiptId)}/verify`, options?.signal);
  }

  /**
   * Re-run the original retrieval against current memories using the
   * original policy bundle captured in the receipt's `policySnapshot`
   * (v0.9+ #159).
   *
   * Emits a new `mode="as_of_replay"` receipt with `parentReceiptId`
   * pointing at the source; the original receipt is **never**
   * modified. Returns the new `replayReceiptId` plus a structural
   * diff envelope (added/removed selected entries, filter changes,
   * context-hash diff).
   *
   * Semantic: current code + original policy. Replay is *not*
   * byte-for-byte reproduction; memories that were added, tombstoned,
   * or supersession-resolved between the original emission and now
   * will appear in the diff. See `docs/replay.md` in the server repo
   * for the design rationale.
   *
   * Throws `StatewaveUnreplayableError` (HTTP 422) when:
   * - `reason === "missing_policy_snapshot"` — pre-v0.9 receipt.
   * - `reason === "nested_replay"` — the receipt is itself a replay.
   * - `reason === "invalid_snapshot"` — snapshot YAML failed to parse.
   *
   * Throws `StatewaveAPIError` on 404 and other non-2xx responses.
   */
  async replayReceipt(receiptId: string, options?: RequestOptions): Promise<ReceiptReplayResult> {
    return this.post(`/v1/receipts/${encodeURIComponent(receiptId)}/replay`, undefined, options?.signal);
  }

  // -- Support: health, SLA, handoff, resolutions ----------------------

  /**
   * Compute the customer health score (0–100) for a subject, with the
   * explainable factors that drove it. Backs proactive risk triage.
   */
  async getHealth(subjectId: string, options?: RequestOptions): Promise<Health> {
    return this.get(`/v1/subjects/${encodeURIComponent(subjectId)}/health`, options?.signal);
  }

  /**
   * Compute SLA metrics for a subject — first-response and resolution
   * times plus breach flags, aggregated across the subject's sessions.
   * Both thresholds fall back to the server defaults (5 minutes /
   * 24 hours) when omitted.
   */
  async getSLA(params: GetSLAParams, options?: RequestOptions): Promise<SLASummary> {
    const qs = new URLSearchParams();
    if (params.firstResponseThresholdMinutes !== undefined) {
      qs.set(
        "first_response_threshold_minutes",
        String(params.firstResponseThresholdMinutes),
      );
    }
    if (params.resolutionThresholdHours !== undefined) {
      qs.set("resolution_threshold_hours", String(params.resolutionThresholdHours));
    }
    const query = qs.toString();
    return this.get(
      `/v1/subjects/${encodeURIComponent(params.subjectId)}/sla${query ? `?${query}` : ""}`,
      options?.signal,
    );
  }

  /**
   * Generate a handoff context pack — a structured escalation brief for
   * shift change or agent transfer. Same caller-identity gate as
   * `getContext`: when the tenant sets `require_caller_identity: true`,
   * both `callerId` and `callerType` are mandatory.
   */
  async createHandoff(params: CreateHandoffParams, options?: RequestOptions): Promise<Handoff> {
    return this.post("/v1/handoff", {
      subjectId: params.subjectId,
      sessionId: params.sessionId,
      ...(params.reason !== undefined && { reason: params.reason }),
      ...(params.maxTokens !== undefined && { maxTokens: params.maxTokens }),
      ...(params.emitReceipt !== undefined && { emitReceipt: params.emitReceipt }),
      ...(params.queryId !== undefined && { queryId: params.queryId }),
      ...(params.taskId !== undefined && { taskId: params.taskId }),
      ...(params.parentReceiptId !== undefined && {
        parentReceiptId: params.parentReceiptId,
      }),
      ...(params.callerId !== undefined && { callerId: params.callerId }),
      ...(params.callerType !== undefined && { callerType: params.callerType }),
    }, options?.signal);
  }

  /**
   * Create or update a resolution record for a support session.
   * Upserts by `subjectId` + `sessionId`.
   */
  async createResolution(params: CreateResolutionParams, options?: RequestOptions): Promise<Resolution> {
    return this.post("/v1/resolutions", {
      subjectId: params.subjectId,
      sessionId: params.sessionId,
      ...(params.status !== undefined && { status: params.status }),
      ...(params.resolutionSummary !== undefined && {
        resolutionSummary: params.resolutionSummary,
      }),
      ...(params.metadata !== undefined && { metadata: params.metadata }),
    }, options?.signal);
  }

  /**
   * List resolution records for a subject, optionally filtered to a
   * single status.
   */
  async listResolutions(params: ListResolutionsParams, options?: RequestOptions): Promise<Resolution[]> {
    const qs = new URLSearchParams({ subject_id: params.subjectId });
    if (params.status !== undefined) qs.set("status", params.status);
    return this.get(`/v1/resolutions?${qs}`, options?.signal);
  }

  /**
   * Fetch the chronological episode + memory timeline for a subject.
   *
   * @param subjectId - The subject to fetch.
   * @param options - Optional per-call options including `signal`.
   * @returns The {@link Timeline}.
   * @throws {StatewaveAPIError} On a non-2xx response.
   * @example
   * const timeline = await sw.getTimeline("user:42");
   */
  async getTimeline(subjectId: string, options?: RequestOptions): Promise<Timeline> {
    return this.get(`/v1/timeline?subject_id=${encodeURIComponent(subjectId)}`, options?.signal);
  }

  /**
   * Delete all episodes and memories for a subject — the GDPR-shaped
   * "forget this user" operation. Irreversible.
   *
   * @param subjectId - The subject to delete.
   * @param options - Optional per-call options including `signal`.
   * @returns A {@link DeleteResult} with the counts removed.
   * @throws {StatewaveAPIError} On a non-2xx response.
   * @example
   * await sw.deleteSubject("user:42");
   */
  async deleteSubject(subjectId: string, options?: RequestOptions): Promise<DeleteResult> {
    return this.request("DELETE", `/v1/subjects/${encodeURIComponent(subjectId)}`, undefined, options?.signal);
  }

  /**
   * List subjects known to the instance, with optional pagination.
   *
   * @param params - Optional `limit` and `offset`.
   * @param options - Optional per-call options including `signal`.
   * @returns A {@link ListSubjectsResult}.
   * @throws {StatewaveAPIError} On a non-2xx response.
   * @example
   * const { subjects } = await sw.listSubjects({ limit: 50 });
   */
  async listSubjects(params?: { limit?: number; offset?: number }, options?: RequestOptions): Promise<ListSubjectsResult> {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.offset !== undefined) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return this.get(`/v1/subjects${query ? `?${query}` : ""}`, options?.signal);
  }

  // ------------------------------------------------------------------

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request("GET", path, undefined, signal);
  }

  private async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request("POST", path, body, signal);
  }

  private async request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    let lastError: Error | undefined;
    const wireBody = body === undefined ? undefined : toWire(body);

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      let resp: Response;
      try {
        const headers: Record<string, string> = { ...this.defaultHeaders };
        if (wireBody !== undefined) headers["Content-Type"] = "application/json";
        resp = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: wireBody !== undefined ? JSON.stringify(wireBody) : undefined,
          signal,
        });
      } catch (err) {
        // Propagate abort immediately — never retry a cancelled request.
        if (err instanceof Error && err.name === "AbortError") throw err;
        // Network/connection error — retryable
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.retryConfig.maxRetries) {
          await this.sleep(this.delayForAttempt(attempt));
          continue;
        }
        throw new StatewaveConnectionError(lastError.message);
      }

      if (resp.ok) {
        return fromWire<T>(await resp.json());
      }

      // Check if retryable status
      if (this.retryConfig.retryOnStatus.includes(resp.status) && attempt < this.retryConfig.maxRetries) {
        const retryAfter = this.parseRetryAfter(resp);
        await this.sleep(this.delayForAttempt(attempt, retryAfter));
        continue;
      }

      await this.handleErrorResponse(resp);
    }

    // Should not reach here
    throw new StatewaveConnectionError(lastError?.message ?? "Retry attempts exhausted");
  }

  private delayForAttempt(attempt: number, retryAfterMs?: number): number {
    if (retryAfterMs !== undefined) {
      return Math.min(retryAfterMs, this.retryConfig.backoffMax);
    }
    let delay = this.retryConfig.backoffBase * (2 ** attempt);
    delay = Math.min(delay, this.retryConfig.backoffMax);
    if (this.retryConfig.jitter) {
      delay *= 0.5 + Math.random();
    }
    return delay;
  }

  private parseRetryAfter(resp: Response): number | undefined {
    const value = resp.headers.get("retry-after");
    if (!value) return undefined;
    const seconds = parseFloat(value);
    return isNaN(seconds) ? undefined : seconds * 1000;
  }

  /**
   * Sleep for `ms` milliseconds. When `signal` is provided the sleep
   * resolves early with an `AbortError` the moment the signal fires.
   */
  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        "abort",
        () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); },
        { once: true },
      );
    });
  }

  private async handleErrorResponse(resp: Response): Promise<never> {
    try {
      const body = await resp.json();
      const err = body?.error;
      if (err && typeof err.code === "string") {
        // Promote unreplayable.<reason> refusals into a typed
        // exception so callers can `catch (e) { if (e instanceof
        // StatewaveUnreplayableError) ... e.reason }` without
        // string-matching the error code. Forward-compat: an
        // unrecognised future reason stays on the generic path.
        if (resp.status === 422 && err.code.startsWith("unreplayable.")) {
          const reason = err.code.slice("unreplayable.".length);
          if (UNREPLAYABLE_REASONS.has(reason)) {
            throw new StatewaveUnreplayableError(
              reason as UnreplayableReason,
              resp.status,
              err.code,
              err.message ?? resp.statusText,
              err.details,
              err.request_id,
            );
          }
        }
        throw new StatewaveAPIError(
          resp.status,
          err.code,
          err.message ?? resp.statusText,
          err.details,
          err.request_id,
        );
      }
    } catch (e) {
      if (e instanceof StatewaveAPIError) throw e;
    }
    throw new StatewaveAPIError(resp.status, "unknown", resp.statusText);
  }
}

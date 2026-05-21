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
  Resolution,
  RetryConfig,
  SLASummary,
  SearchMemoriesParams,
  SearchResult,
  SetMemoryLabelsParams,
  Timeline,
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

export class StatewaveClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private retryConfig: Required<RetryConfig>;

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

  async createEpisode(params: CreateEpisodeParams): Promise<Episode> {
    return this.post("/v1/episodes", {
      subjectId: params.subjectId,
      source: params.source,
      type: params.type,
      payload: params.payload,
      metadata: params.metadata ?? {},
      provenance: params.provenance ?? {},
    });
  }

  async createEpisodesBatch(episodes: CreateEpisodeParams[]): Promise<BatchCreateResult> {
    return this.post("/v1/episodes/batch", { episodes: episodes.map(e => ({
      subjectId: e.subjectId,
      source: e.source,
      type: e.type,
      payload: e.payload,
      metadata: e.metadata ?? {},
      provenance: e.provenance ?? {},
    }))});
  }

  async compileMemories(subjectId: string): Promise<CompileResult> {
    return this.post("/v1/memories/compile", { subjectId });
  }

  /** Submit async compilation — returns immediately with a jobId. */
  async compileMemoriesAsync(subjectId: string): Promise<CompileJob> {
    return this.post("/v1/memories/compile", { subjectId, async: true });
  }

  /** Poll the status of an async compile job. */
  async getCompileStatus(jobId: string): Promise<CompileJob> {
    return this.get(`/v1/memories/compile/${encodeURIComponent(jobId)}`);
  }

  /** Submit async compilation and poll until terminal state or timeout. */
  async compileMemoriesWait(
    subjectId: string,
    options?: { pollInterval?: number; timeout?: number }
  ): Promise<CompileJob> {
    const pollInterval = options?.pollInterval ?? 500;
    const timeout = options?.timeout ?? 60_000;

    const job = await this.compileMemoriesAsync(subjectId);
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, pollInterval));
      const status = await this.getCompileStatus(job.jobId);
      if (status.status === "completed" || status.status === "failed") {
        return status;
      }
    }
    throw new Error(`Compile job ${job.jobId} did not complete within ${timeout}ms`);
  }

  async searchMemories(params: SearchMemoriesParams): Promise<SearchResult> {
    const qs = new URLSearchParams({ subject_id: params.subjectId });
    if (params.kind) qs.set("kind", params.kind);
    if (params.query) qs.set("q", params.query);
    if (params.semantic) qs.set("semantic", "true");
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    return this.get(`/v1/memories/search?${qs}`);
  }

  async getContext(params: GetContextParams): Promise<ContextBundle> {
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
    });
  }

  // -- Memory labels (#50) ----------------------------------------------

  /**
   * Replace a memory's sensitivityLabels. Server normalizes
   * (dedup + lowercase + trim) and caps at 32 entries. Empty array
   * clears all labels — the memory becomes untagged and any policy
   * rule that depends on a label match falls through to default-allow.
   */
  async setMemoryLabels(params: SetMemoryLabelsParams): Promise<Memory> {
    return this.request(
      "PATCH",
      `/v1/memories/${encodeURIComponent(params.memoryId)}/labels`,
      { sensitivityLabels: params.sensitivityLabels },
    );
  }

  /** Return just the assembled context string, ready to inject into a prompt. */
  async getContextString(params: GetContextParams): Promise<string> {
    const bundle = await this.getContext(params);
    return bundle.assembledContext;
  }

  // -- Receipts --------------------------------------------------------

  /** Fetch a single state-assembly receipt by ULID. */
  async getReceipt(receiptId: string): Promise<Receipt> {
    return this.get(`/v1/receipts/${encodeURIComponent(receiptId)}`);
  }

  /**
   * List state-assembly receipts for a subject, newest first.
   * Cursor-paginated — pass back the previous response's `nextCursor`
   * to fetch the next page.
   */
  async listReceipts(params: ListReceiptsParams): Promise<ReceiptList> {
    const qs = new URLSearchParams({ subject_id: params.subjectId });
    if (params.since !== undefined) qs.set("since", params.since);
    if (params.until !== undefined) qs.set("until", params.until);
    if (params.cursor !== undefined) qs.set("cursor", params.cursor);
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    return this.get(`/v1/receipts?${qs}`);
  }

  // -- Support: health, SLA, handoff, resolutions ----------------------

  /**
   * Compute the customer health score (0–100) for a subject, with the
   * explainable factors that drove it. Backs proactive risk triage.
   */
  async getHealth(subjectId: string): Promise<Health> {
    return this.get(`/v1/subjects/${encodeURIComponent(subjectId)}/health`);
  }

  /**
   * Compute SLA metrics for a subject — first-response and resolution
   * times plus breach flags, aggregated across the subject's sessions.
   * Both thresholds fall back to the server defaults (5 minutes /
   * 24 hours) when omitted.
   */
  async getSLA(params: GetSLAParams): Promise<SLASummary> {
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
    );
  }

  /**
   * Generate a handoff context pack — a structured escalation brief for
   * shift change or agent transfer. Same caller-identity gate as
   * `getContext`: when the tenant sets `require_caller_identity: true`,
   * both `callerId` and `callerType` are mandatory.
   */
  async createHandoff(params: CreateHandoffParams): Promise<Handoff> {
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
    });
  }

  /**
   * Create or update a resolution record for a support session.
   * Upserts by `subjectId` + `sessionId`.
   */
  async createResolution(params: CreateResolutionParams): Promise<Resolution> {
    return this.post("/v1/resolutions", {
      subjectId: params.subjectId,
      sessionId: params.sessionId,
      ...(params.status !== undefined && { status: params.status }),
      ...(params.resolutionSummary !== undefined && {
        resolutionSummary: params.resolutionSummary,
      }),
      ...(params.metadata !== undefined && { metadata: params.metadata }),
    });
  }

  /**
   * List resolution records for a subject, optionally filtered to a
   * single status.
   */
  async listResolutions(params: ListResolutionsParams): Promise<Resolution[]> {
    const qs = new URLSearchParams({ subject_id: params.subjectId });
    if (params.status !== undefined) qs.set("status", params.status);
    return this.get(`/v1/resolutions?${qs}`);
  }

  async getTimeline(subjectId: string): Promise<Timeline> {
    return this.get(`/v1/timeline?subject_id=${encodeURIComponent(subjectId)}`);
  }

  async deleteSubject(subjectId: string): Promise<DeleteResult> {
    return this.request("DELETE", `/v1/subjects/${encodeURIComponent(subjectId)}`);
  }

  async listSubjects(params?: { limit?: number; offset?: number }): Promise<ListSubjectsResult> {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.offset !== undefined) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return this.get(`/v1/subjects${query ? `?${query}` : ""}`);
  }

  // ------------------------------------------------------------------

  private async get<T>(path: string): Promise<T> {
    return this.request("GET", path);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request("POST", path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
        });
      } catch (err) {
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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async handleErrorResponse(resp: Response): Promise<never> {
    try {
      const body = await resp.json();
      const err = body?.error;
      if (err && typeof err.code === "string") {
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

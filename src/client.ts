import type {
  BatchCreateResult,
  ClientOptions,
  CompileJob,
  CompileResult,
  ContextBundle,
  CreateEpisodeParams,
  DeleteResult,
  Episode,
  GetContextParams,
  ListSubjectsResult,
  RetryConfig,
  SearchMemoriesParams,
  SearchResult,
  Timeline,
} from "./types.js";

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
      subject_id: params.subject_id,
      source: params.source,
      type: params.type,
      payload: params.payload,
      metadata: params.metadata ?? {},
      provenance: params.provenance ?? {},
    });
  }

  async createEpisodesBatch(episodes: CreateEpisodeParams[]): Promise<BatchCreateResult> {
    return this.post("/v1/episodes/batch", { episodes: episodes.map(e => ({
      subject_id: e.subject_id,
      source: e.source,
      type: e.type,
      payload: e.payload,
      metadata: e.metadata ?? {},
      provenance: e.provenance ?? {},
    }))});
  }

  async compileMemories(subjectId: string): Promise<CompileResult> {
    return this.post("/v1/memories/compile", { subject_id: subjectId });
  }

  /** Submit async compilation — returns immediately with a job_id. */
  async compileMemoriesAsync(subjectId: string): Promise<CompileJob> {
    return this.post("/v1/memories/compile", { subject_id: subjectId, async: true });
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
      const status = await this.getCompileStatus(job.job_id);
      if (status.status === "completed" || status.status === "failed") {
        return status;
      }
    }
    throw new Error(`Compile job ${job.job_id} did not complete within ${timeout}ms`);
  }

  async searchMemories(params: SearchMemoriesParams): Promise<SearchResult> {
    const qs = new URLSearchParams({ subject_id: params.subject_id });
    if (params.kind) qs.set("kind", params.kind);
    if (params.query) qs.set("q", params.query);
    if (params.semantic) qs.set("semantic", "true");
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    return this.get(`/v1/memories/search?${qs}`);
  }

  async getContext(params: GetContextParams): Promise<ContextBundle> {
    return this.post("/v1/context", {
      subject_id: params.subject_id,
      task: params.task,
      ...(params.max_tokens !== undefined && { max_tokens: params.max_tokens }),
    });
  }

  /** Return just the assembled context string, ready to inject into a prompt. */
  async getContextString(params: GetContextParams): Promise<string> {
    const bundle = await this.getContext(params);
    return bundle.assembled_context;
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

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      let resp: Response;
      try {
        const headers: Record<string, string> = { ...this.defaultHeaders };
        if (body) headers["Content-Type"] = "application/json";
        resp = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
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
        return resp.json() as Promise<T>;
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

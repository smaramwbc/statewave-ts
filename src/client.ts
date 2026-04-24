import type {
  CompileResult,
  ContextBundle,
  CreateEpisodeParams,
  DeleteResult,
  Episode,
  GetContextParams,
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

  constructor(baseUrl = "http://localhost:8100") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
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

  async compileMemories(subjectId: string): Promise<CompileResult> {
    return this.post("/v1/memories/compile", { subject_id: subjectId });
  }

  async searchMemories(params: SearchMemoriesParams): Promise<SearchResult> {
    const qs = new URLSearchParams({ subject_id: params.subject_id });
    if (params.kind) qs.set("kind", params.kind);
    if (params.query) qs.set("q", params.query);
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

  async getTimeline(subjectId: string): Promise<Timeline> {
    return this.get(`/v1/timeline?subject_id=${encodeURIComponent(subjectId)}`);
  }

  async deleteSubject(subjectId: string): Promise<DeleteResult> {
    return this.request("DELETE", `/v1/subjects/${encodeURIComponent(subjectId)}`);
  }

  // ------------------------------------------------------------------

  private async get<T>(path: string): Promise<T> {
    return this.request("GET", path);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request("POST", path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let resp: Response;
    try {
      resp = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new StatewaveConnectionError(
        err instanceof Error ? err.message : "Cannot connect to Statewave server"
      );
    }
    if (!resp.ok) {
      await this.handleErrorResponse(resp);
    }
    return resp.json() as Promise<T>;
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

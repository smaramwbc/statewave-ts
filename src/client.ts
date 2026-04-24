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
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) {
      throw new Error(`Statewave API error: ${resp.status} ${resp.statusText}`);
    }
    return resp.json() as Promise<T>;
  }
}

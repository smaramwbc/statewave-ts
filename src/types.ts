/** Statewave API types — mirrors the backend contract. */

export interface Episode {
  id: string;
  subject_id: string;
  source: string;
  type: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  provenance: Record<string, unknown>;
  created_at: string;
}

export interface Memory {
  id: string;
  subject_id: string;
  kind: string;
  content: string;
  summary: string;
  confidence: number;
  valid_from: string;
  valid_to: string | null;
  source_episode_ids: string[];
  metadata: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CompileResult {
  subject_id: string;
  memories_created: number;
  memories: Memory[];
}

export interface SearchResult {
  memories: Memory[];
}

export interface ContextBundle {
  subject_id: string;
  task: string;
  facts: Memory[];
  episodes: Episode[];
  procedures: Memory[];
  provenance: Record<string, unknown>;
  assembled_context: string;
  token_estimate: number;
}

export interface Timeline {
  subject_id: string;
  episodes: Episode[];
  memories: Memory[];
}

export interface DeleteResult {
  subject_id: string;
  episodes_deleted: number;
  memories_deleted: number;
}

export interface BatchCreateResult {
  episodes_created: number;
  episodes: Episode[];
}

export interface SubjectSummary {
  subject_id: string;
  episode_count: number;
  memory_count: number;
}

export interface ListSubjectsResult {
  subjects: SubjectSummary[];
  total: number;
}

/** Status of an async compile job. */
export interface CompileJob {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed";
  subject_id: string;
  memories_created?: number;
  memories?: Memory[];
  error?: string;
}

export interface CreateEpisodeParams {
  subject_id: string;
  source: string;
  type: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
}

export interface SearchMemoriesParams {
  subject_id: string;
  kind?: string;
  query?: string;
  semantic?: boolean;
  limit?: number;
}

export interface GetContextParams {
  subject_id: string;
  task: string;
  max_tokens?: number;
}

export interface ClientOptions {
  baseUrl?: string;
  apiKey?: string;
  tenantId?: string;
  /** Retry configuration. Set to false to disable retries. */
  retry?: RetryConfig | false;
}

/** Configuration for automatic retry on transient failures. */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3). */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 500). */
  backoffBase?: number;
  /** Maximum delay cap in ms (default: 30000). */
  backoffMax?: number;
  /** Whether to add random jitter (default: true). */
  jitter?: boolean;
  /** HTTP status codes that trigger a retry (default: [429, 500, 502, 503, 504]). */
  retryOnStatus?: number[];
}

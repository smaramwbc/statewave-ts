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
  /** ULID of the state-assembly receipt, when one was emitted. */
  receipt_id?: string | null;
  /** True iff a receipt was successfully written for this call. */
  receipt_emitted?: boolean;
}

/**
 * One entry inside a state-assembly receipt. Strict-superset shape —
 * fields not relevant to the entry's `type` are null. See
 * `docs/state-assembly-receipts.md` in the server repository for the
 * full schema.
 */
export interface ReceiptSelectedEntry {
  type: "memory" | "episode";
  /** Present when type === "memory". */
  memory_id?: string;
  /** Present when type === "memory". */
  kind?: string;
  valid_from?: string | null;
  valid_to?: string | null;
  supersession_status?: "active" | "superseded" | "tombstoned";
  source_episode_ids?: string[];
  provenance_hash?: string;
  fact_key?: string | null;
  conflict_status?: "none" | "merged" | "overridden" | "unresolved";
  /** Present when type === "episode". */
  episode_id?: string;
  source?: string;
  event_type?: string;
  occurred_at?: string | null;
  /** Final position in the assembled bundle. */
  rank: number;
  score?: number | null;
}

export interface ReceiptPolicy {
  policy_bundle_hash: string | null;
  filters_applied: unknown[];
  filters_skipped: unknown[];
  mode: "log_only" | "enforce";
}

export interface ReceiptOutput {
  context_hash: string;
  context_size_bytes: number;
  canonicalization_version: number;
  token_estimate: number;
}

/**
 * Immutable per-retrieval audit artifact for a single context assembly.
 * See `docs/state-assembly-receipts.md` in the server repository.
 */
export interface Receipt {
  receipt_id: string;
  parent_receipt_id: string | null;
  mode: "retrieval" | string;
  query_id: string | null;
  task_id: string | null;
  tenant_id: string | null;
  subject_id: string;
  task: string;
  as_of: string;
  created_at: string;
  selected_entries: ReceiptSelectedEntry[];
  policy: ReceiptPolicy;
  output: ReceiptOutput;
  region: string | null;
  receipt_signature: string | null;
}

export interface ReceiptList {
  receipts: Receipt[];
  /** Pass back as the `cursor` param to fetch the next page; null when no more. */
  next_cursor: string | null;
}

export interface ListReceiptsParams {
  subject_id: string;
  since?: string;
  until?: string;
  cursor?: string;
  limit?: number;
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
  session_id?: string;
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
  session_id?: string;
  /**
   * Opt in to emitting a state-assembly receipt for this call. The
   * tenant config can also force emission on or off independently of
   * this flag. See `docs/state-assembly-receipts.md` in the server
   * repository.
   */
  emit_receipt?: boolean;
  query_id?: string;
  task_id?: string;
  parent_receipt_id?: string;
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

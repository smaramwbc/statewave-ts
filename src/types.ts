/**
 * Statewave API types.
 *
 * The public SDK surface is camelCase, idiomatic TypeScript. The
 * Statewave HTTP API speaks snake_case on the wire; `StatewaveClient`
 * transparently maps between the two in both directions, so callers
 * never see a snake_case key. The free-form `payload`, `metadata`, and
 * `provenance` bags are passed through verbatim — their inner keys are
 * never rewritten, so arbitrary user data round-trips losslessly.
 */

export interface Episode {
  id: string;
  subjectId: string;
  source: string;
  type: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  provenance: Record<string, unknown>;
  createdAt: string;
}

export interface Memory {
  id: string;
  subjectId: string;
  kind: string;
  content: string;
  summary: string;
  confidence: number;
  validFrom: string;
  validTo: string | null;
  sourceEpisodeIds: string[];
  metadata: Record<string, unknown>;
  status: string;
  /**
   * Per-memory capability tags consumed by the sensitivity-label
   * policy layer (#50). Empty = untagged = policy default-allow.
   * Older servers without the policy layer omit the field.
   */
  sensitivityLabels?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CompileResult {
  subjectId: string;
  memoriesCreated: number;
  memories: Memory[];
}

export interface SearchResult {
  memories: Memory[];
}

export interface ContextBundle {
  subjectId: string;
  task: string;
  facts: Memory[];
  episodes: Episode[];
  procedures: Memory[];
  provenance: Record<string, unknown>;
  assembledContext: string;
  tokenEstimate: number;
  /** ULID of the state-assembly receipt, when one was emitted. */
  receiptId?: string | null;
  /** True iff a receipt was successfully written for this call. */
  receiptEmitted?: boolean;
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
  memoryId?: string;
  /** Present when type === "memory". */
  kind?: string;
  validFrom?: string | null;
  validTo?: string | null;
  supersessionStatus?: "active" | "superseded" | "tombstoned";
  sourceEpisodeIds?: string[];
  provenanceHash?: string;
  factKey?: string | null;
  conflictStatus?: "none" | "merged" | "overridden" | "unresolved";
  /** Present when type === "episode". */
  episodeId?: string;
  source?: string;
  eventType?: string;
  occurredAt?: string | null;
  /** Final position in the assembled bundle. */
  rank: number;
  score?: number | null;
}

export interface ReceiptPolicy {
  policyBundleHash: string | null;
  filtersApplied: unknown[];
  filtersSkipped: unknown[];
  mode: "log_only" | "enforce";
}

export interface ReceiptOutput {
  contextHash: string;
  contextSizeBytes: number;
  canonicalizationVersion: number;
  tokenEstimate: number;
}

/**
 * Immutable per-retrieval audit artifact for a single context assembly.
 * See `docs/state-assembly-receipts.md` in the server repository.
 */
export interface Receipt {
  receiptId: string;
  parentReceiptId: string | null;
  mode: "retrieval" | string;
  queryId: string | null;
  taskId: string | null;
  tenantId: string | null;
  subjectId: string;
  task: string;
  asOf: string;
  createdAt: string;
  selectedEntries: ReceiptSelectedEntry[];
  policy: ReceiptPolicy;
  output: ReceiptOutput;
  region: string | null;
  receiptSignature: string | null;
}

export interface ReceiptList {
  receipts: Receipt[];
  /** Pass back as the `cursor` param to fetch the next page; null when no more. */
  nextCursor: string | null;
}

export interface ListReceiptsParams {
  subjectId: string;
  since?: string;
  until?: string;
  cursor?: string;
  limit?: number;
}

export interface Timeline {
  subjectId: string;
  episodes: Episode[];
  memories: Memory[];
}

export interface DeleteResult {
  subjectId: string;
  episodesDeleted: number;
  memoriesDeleted: number;
}

export interface BatchCreateResult {
  episodesCreated: number;
  episodes: Episode[];
}

export interface SubjectSummary {
  subjectId: string;
  episodeCount: number;
  memoryCount: number;
}

export interface ListSubjectsResult {
  subjects: SubjectSummary[];
  total: number;
}

/** Status of an async compile job. */
export interface CompileJob {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed";
  subjectId: string;
  memoriesCreated?: number;
  memories?: Memory[];
  error?: string;
}

export interface CreateEpisodeParams {
  subjectId: string;
  source: string;
  type: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  sessionId?: string;
}

export interface SearchMemoriesParams {
  subjectId: string;
  kind?: string;
  query?: string;
  semantic?: boolean;
  limit?: number;
}

export interface GetContextParams {
  subjectId: string;
  task: string;
  maxTokens?: number;
  sessionId?: string;
  /**
   * Opt in to emitting a state-assembly receipt for this call. The
   * tenant config can also force emission on or off independently of
   * this flag. See `docs/state-assembly-receipts.md` in the server
   * repository.
   */
  emitReceipt?: boolean;
  queryId?: string;
  taskId?: string;
  parentReceiptId?: string;
  /**
   * Caller identity consumed by the sensitivity-label policy layer
   * (#50). When the tenant config sets `require_caller_identity:
   * true`, both `callerId` and `callerType` are mandatory.
   */
  callerId?: string;
  callerType?: string;
}

export interface SetMemoryLabelsParams {
  memoryId: string;
  /**
   * Replacement label list. Server normalizes (dedup + lowercase +
   * trim) and caps at 32 entries. Empty list clears all labels.
   */
  sensitivityLabels: string[];
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

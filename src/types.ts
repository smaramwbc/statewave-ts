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

// -- Support: health, SLA, handoff, resolutions ----------------------

/** Support health-state bucket. */
export type HealthState = "healthy" | "watch" | "at_risk";

/** Resolution lifecycle status. */
export type ResolutionStatus = "open" | "resolved" | "unresolved";

/** One explainable factor behind a customer health score. */
export interface HealthFactor {
  /** Stable signal identifier, e.g. `sla_resolution_breaches`. */
  signal: string;
  /** Signed score contribution — a negative impact drags the score down. */
  impact: number;
  /** Human-readable explanation of the factor. */
  detail: string;
}

/** Customer health score (0–100) with the factors that drove it. */
export interface Health {
  subjectId: string;
  score: number;
  state: HealthState;
  factors: HealthFactor[];
}

/** SLA metrics for a single support session. */
export interface SessionSLA {
  sessionId: string;
  /** `resolved` | `open`. */
  status: string;
  firstMessageAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  firstResponseSeconds: number | null;
  resolutionSeconds: number | null;
  openDurationSeconds: number | null;
  firstResponseBreached: boolean;
  resolutionBreached: boolean;
}

/** Aggregate SLA metrics for a subject across all of its sessions. */
export interface SLASummary {
  subjectId: string;
  totalSessions: number;
  resolvedSessions: number;
  openSessions: number;
  avgFirstResponseSeconds: number | null;
  avgResolutionSeconds: number | null;
  firstResponseBreachCount: number;
  resolutionBreachCount: number;
  sessions: SessionSLA[];
}

/** A prior resolution surfaced inside a handoff brief. */
export interface ResolutionSummaryItem {
  sessionId: string;
  status: string;
  summary: string | null;
  resolvedAt: string | null;
}

/** Structured escalation brief — the handoff context pack. */
export interface Handoff {
  subjectId: string;
  sessionId: string;
  reason: string;
  generatedAt: string;
  customerSummary: string;
  activeIssue: string;
  attemptedSteps: string[];
  keyFacts: string[];
  resolutionHistory: ResolutionSummaryItem[];
  recentContext: string[];
  healthScore: number | null;
  healthState: HealthState | null;
  healthFactors: HealthFactor[];
  /** Pre-rendered markdown brief, ready for human or LLM consumption. */
  handoffNotes: string;
  tokenEstimate: number;
  provenance: Record<string, unknown>;
  /** ULID of the state-assembly receipt, when one was emitted. */
  receiptId?: string | null;
  /** True iff a receipt was successfully written for this call. */
  receiptEmitted?: boolean;
}

/** Resolution tracking record for a support session. */
export interface Resolution {
  id: string;
  subjectId: string;
  sessionId: string;
  status: ResolutionStatus;
  resolutionSummary: string | null;
  resolvedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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

export interface GetSLAParams {
  subjectId: string;
  /** First-response SLA threshold in minutes (server default: 5). */
  firstResponseThresholdMinutes?: number;
  /** Resolution SLA threshold in hours (server default: 24). */
  resolutionThresholdHours?: number;
}

export interface CreateHandoffParams {
  subjectId: string;
  /** Session being handed off. */
  sessionId: string;
  /** Why the handoff is happening (server default: "escalation"). */
  reason?: string;
  /** Token budget for the assembled brief. */
  maxTokens?: number;
  /**
   * Opt in to emitting a state-assembly receipt for this call. The
   * tenant config can also force emission on or off independently of
   * this flag.
   */
  emitReceipt?: boolean;
  queryId?: string;
  taskId?: string;
  parentReceiptId?: string;
  /**
   * Caller identity consumed by the sensitivity-label policy layer
   * (#50). When the tenant config sets `require_caller_identity: true`,
   * both `callerId` and `callerType` are mandatory.
   */
  callerId?: string;
  callerType?: string;
}

export interface CreateResolutionParams {
  subjectId: string;
  sessionId: string;
  /** Lifecycle status (server default: "open"). */
  status?: ResolutionStatus;
  /** Short human summary of how the session was resolved. */
  resolutionSummary?: string;
  /** Free-form caller-owned bag; inner keys round-trip verbatim. */
  metadata?: Record<string, unknown>;
}

export interface ListResolutionsParams {
  subjectId: string;
  /** Filter to a single status. Omit to list every resolution. */
  status?: ResolutionStatus;
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

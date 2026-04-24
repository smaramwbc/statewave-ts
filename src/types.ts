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
}

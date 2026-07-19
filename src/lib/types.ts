export type ViewId = "ask" | "search" | "sources" | "activity" | "settings";

export interface ClientError {
  kind: "api" | "connection" | "response" | "stream" | "token" | "validation";
  message: string;
  status?: number;
}

export interface HealthResponse {
  status: string;
  version: string;
}

export interface StatusResponse {
  status: string;
  version: string;
  provider: string;
  chat_model: string | null;
  embedding_model: string | null;
  image_model: string | null;
  sources: number;
  indexed_files: number;
  indexed_chunks: number;
  indexing_state: string;
  last_index_job_status: string | null;
}

export interface ProviderStatusResponse {
  provider: string;
  reachable: boolean;
  message: string;
}

export interface ModelInfo {
  key: string;
  name: string;
  type: string;
  loaded: boolean;
  supports_images: boolean;
  max_context_length?: number | null;
  quantization?: Record<string, unknown> | null;
}

export interface ModelsResponse {
  provider: string;
  chat_models: ModelInfo[];
  embedding_models: ModelInfo[];
  image_models: ModelInfo[];
}

export interface Source {
  id: string;
  path: string;
  recursive: boolean;
  enabled: boolean;
  created_at: string;
}

export interface SourceListResponse {
  sources: Source[];
}

export interface IndexJob {
  job_id: string | null;
  state: string;
  total_files: number;
  processed_files: number;
  indexed_files: number;
  skipped_files: number;
  already_indexed_files: number;
  failed_files: number;
  chunks_created: number;
  current_file: string | null;
  error: string | null;
  progress: number;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
}

export interface SearchResult {
  id: string;
  file_id: string;
  source_id: string;
  score: number;
  source_type: string;
  path: string;
  file_name: string;
  title: string;
  snippet: string;
  chunk_index: number;
  metadata: Record<string, unknown>;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export interface ImagePreview {
  dataUrl: string;
  width: number;
  height: number;
}

export interface AskResponse {
  answer: string;
  sources: SearchResult[];
}

export interface StreamEvent {
  event: "delta" | "sources" | "done" | "error";
  data: {
    text?: string;
    message?: string;
    sources?: SearchResult[];
  };
}

export interface ClientSettings {
  apiUrl: string;
}

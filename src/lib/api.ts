import { Channel, invoke } from "@tauri-apps/api/core";
import { DEFAULT_API_URL } from "../config";
import type {
  AskResponse,
  AskOptions,
  ClientError,
  ClientSettings,
  HealthResponse,
  ImagePreview,
  IndexJob,
  ModelsResponse,
  ProviderStatusResponse,
  SearchResponse,
  Source,
  SourceListResponse,
  StatusResponse,
  StreamEvent,
} from "./types";

const SETTINGS_KEY = "openmind-client-settings";

function ensureDesktopBridge(): void {
  if (!("__TAURI_INTERNALS__" in window)) {
    throw {
      kind: "connection",
      message: "Desktop bridge unavailable. Start the app with npm run tauri dev.",
    } satisfies ClientError;
  }
}

export function loadSettings(): ClientSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<ClientSettings>;
    return { apiUrl: stored.apiUrl?.trim() || DEFAULT_API_URL };
  } catch {
    return { apiUrl: DEFAULT_API_URL };
  }
}

export function saveSettings(settings: ClientSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function toClientError(error: unknown): ClientError {
  if (typeof error === "object" && error !== null && "message" in error) {
    const candidate = error as Partial<ClientError>;
    return {
      kind: candidate.kind ?? "response",
      message: String(candidate.message),
      status: candidate.status,
    };
  }
  return {
    kind: "response",
    message: typeof error === "string" ? error : "Something went wrong.",
  };
}

export class OpenMindApi {
  constructor(readonly baseUrl: string) {}

  health(): Promise<HealthResponse> {
    return this.request("GET", "/health");
  }

  status(): Promise<StatusResponse> {
    return this.request("GET", "/api/v1/status");
  }

  providerStatus(): Promise<ProviderStatusResponse> {
    return this.request("GET", "/api/v1/providers/status");
  }

  models(): Promise<ModelsResponse> {
    return this.request("GET", "/api/v1/models");
  }

  sources(): Promise<SourceListResponse> {
    return this.request("GET", "/api/v1/sources");
  }

  addSource(path: string): Promise<Source> {
    return this.request("POST", "/api/v1/sources", { path, recursive: true });
  }

  removeSource(sourceId: string): Promise<void> {
    return this.request("DELETE", `/api/v1/sources/${encodeURIComponent(sourceId)}`);
  }

  indexStatus(): Promise<IndexJob> {
    return this.request("GET", "/api/v1/index/status");
  }

  indexAction(action: "start" | "pause" | "resume" | "stop"): Promise<IndexJob> {
    return this.request("POST", `/api/v1/index/${action}`);
  }

  search(query: string, limit = 10): Promise<SearchResponse> {
    return this.request("POST", "/api/v1/search", { query, limit });
  }

  ask(question: string, options: AskOptions = {}): Promise<AskResponse> {
    return this.request("POST", "/api/v1/ask", {
      question,
      limit: options.limit ?? 8,
      include_sources: options.includeSources ?? true,
      reasoning: options.reasoning ?? false,
      session_id: options.sessionId ?? null,
    });
  }

  endChatSession(sessionId: string): Promise<void> {
    return this.request(
      "DELETE",
      `/api/v1/chat/sessions/${encodeURIComponent(sessionId)}`,
    );
  }

  openFile(fileId: string): Promise<void> {
    return this.request("POST", "/api/v1/actions/open", { file_id: fileId });
  }

  imagePreview(fileId: string): Promise<ImagePreview> {
    ensureDesktopBridge();
    return invoke<ImagePreview>("openmind_image_preview", {
      baseUrl: this.baseUrl,
      fileId,
    });
  }

  async streamAsk(
    question: string,
    onEvent: (event: StreamEvent) => void,
    options: AskOptions = {},
  ): Promise<void> {
    ensureDesktopBridge();
    const channel = new Channel<StreamEvent>();
    channel.onmessage = onEvent;
    await invoke("stream_openmind_ask", {
      baseUrl: this.baseUrl,
      request: {
        question,
        limit: options.limit ?? 8,
        includeSources: options.includeSources ?? true,
        reasoning: options.reasoning ?? false,
        sessionId: options.sessionId ?? null,
      },
      onEvent: channel,
    });
  }

  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    ensureDesktopBridge();
    return invoke<T>("openmind_request", {
      baseUrl: this.baseUrl,
      method,
      path,
      body: body ?? null,
    });
  }
}

export function createApi(settings: ClientSettings): OpenMindApi {
  return new OpenMindApi(settings.apiUrl);
}

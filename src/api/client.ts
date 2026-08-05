import type {
  ProcessMessageDto,
  ChatMessage,
  AsyncResponse,
  RealtimeChatHistory,
  ChatHistory,
  AssistantSpecialization,
  ApiError,
  ToolCallResponse,
  ConversationSummary,
  ListConversationsResponse,
  FeedbackSubmission,
  FeedbackEntry,
  AgentThreadDto,
  AgentDto,
  WhisperTranscriptionResponse,
  TenantUsage,
  TenantUsageHistoryRow,
  TenantUsageHistoryQuery,
  CoreMemoryList,
  CoreMemoryEntry,
  Integration,
} from "./types";

/**
 * A tenant session, as the integrator's backend hands it over.
 *
 * A bare string is accepted too — the expiry is then read out of the token
 * itself, so the simplest possible `getToken` still gets proactive renewal.
 */
export interface TenantSessionToken {
  token: string;
  /** Epoch milliseconds. */
  expiresAt?: number;
  /** Seconds from now. Used when `expiresAt` is absent. */
  expiresIn?: number;
}

export interface DevicApiClientConfig {
  /**
   * The public API key. Optional when `getToken` is supplied — a page using
   * tenant sessions has no reason to carry one.
   */
  apiKey?: string;
  baseUrl: string;
  /**
   * Fetches a tenant session from YOUR backend, which is the only place that
   * knows who is logged in.
   *
   * Supplying this changes what the tenant is: with an API key alone the tenant
   * is whatever the page says it is, and the page can say anything. With a
   * session it is what your server signed. Called again on its own whenever the
   * token is about to expire or the API rejects it.
   */
  getToken?: () => Promise<string | TenantSessionToken>;
}

/** Renew this long before expiry, so a request never leaves with a dead token. */
const RENEWAL_MARGIN_MS = 60_000;

/**
 * The expiry inside a JWT, in epoch milliseconds.
 *
 * Read rather than required, so `getToken` can return just the string. Any
 * failure means "no idea", and the token is then renewed only when the API
 * rejects it — correct, just less graceful.
 */
function expiryOf(token: string): number | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = JSON.parse(json)?.exp;
    return typeof exp === "number" ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Devic API client using native fetch
 */
export class DevicApiClient {
  private config: DevicApiClientConfig;
  private session?: { token: string; expiresAt?: number };
  /** In flight renewal, shared so a burst of calls fetches one token. */
  private renewing?: Promise<string>;

  constructor(config: DevicApiClientConfig) {
    this.config = config;
  }

  /**
   * Update client configuration
   */
  setConfig(config: Partial<DevicApiClientConfig>): void {
    const previous = this.config;
    this.config = { ...this.config, ...config };
    // A new `getToken` speaks for a different end user; keeping the old token
    // would show them the previous one's conversations.
    if (config.getToken && config.getToken !== previous.getToken) {
      this.session = undefined;
    }
  }

  /** The credential for the next request, renewed if it is about to expire. */
  private async authorization(force = false): Promise<string> {
    if (!this.config.getToken) return this.config.apiKey ?? "";

    const current = this.session;
    const stillGood =
      current &&
      (current.expiresAt === undefined ||
        current.expiresAt - Date.now() > RENEWAL_MARGIN_MS);
    if (stillGood && !force) return current.token;

    return this.renew();
  }

  private renew(): Promise<string> {
    if (!this.renewing) {
      this.renewing = Promise.resolve(this.config.getToken!())
        .then((result) => {
          const token = typeof result === "string" ? result : result.token;
          const declared =
            typeof result === "string"
              ? undefined
              : (result.expiresAt ??
                (result.expiresIn
                  ? Date.now() + result.expiresIn * 1000
                  : undefined));
          this.session = { token, expiresAt: declared ?? expiryOf(token) };
          return token;
        })
        .finally(() => {
          this.renewing = undefined;
        });
    }
    return this.renewing;
  }

  /**
   * Make an authenticated request to the API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    isRetry = false,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await this.authorization(isRetry)}`,
      "devic-api-source": "ui",
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // A session can die between being checked and being used — a clock adrift,
    // a tab asleep for an hour, the key revoked. One retry with a fresh token
    // turns that into a pause instead of a broken conversation.
    if (response.status === 401 && this.config.getToken && !isRetry) {
      return this.request<T>(endpoint, options, true);
    }

    if (!response.ok) {
      let errorData: ApiError;
      try {
        errorData = await response.json();
      } catch {
        errorData = {
          statusCode: response.status,
          message: response.statusText,
        };
      }
      throw new DevicApiError(errorData);
    }

    // Handle responses that may have a wrapper structure
    const data = await response.json();

    // If the response has a data property, extract it (common wrapper pattern)
    if (data && typeof data === "object" && "data" in data) {
      return data.data as T;
    }

    return data as T;
  }

  /**
   * Get all assistant specializations
   */
  async getAssistants(external = false): Promise<AssistantSpecialization[]> {
    const query = external ? "?external=true" : "";
    return this.request<AssistantSpecialization[]>(
      `/api/v1/assistants${query}`,
    );
  }

  /**
   * Get a specific assistant specialization
   */
  async getAssistant(identifier: string): Promise<AssistantSpecialization> {
    return this.request<AssistantSpecialization>(
      `/api/v1/assistants/${identifier}`,
    );
  }

  /**
   * Send a message to an assistant (sync mode)
   */
  async sendMessage(
    assistantId: string,
    dto: ProcessMessageDto,
    signal?: AbortSignal,
  ): Promise<ChatMessage[]> {
    return this.request<ChatMessage[]>(
      `/api/v1/assistants/${assistantId}/messages${dto.skipSummarization ? "?skipSummarization=true" : ""}`,
      {
        method: "POST",
        body: JSON.stringify(dto),
        signal,
      },
    );
  }

  /**
   * Send a message to an assistant (async mode)
   */
  async sendMessageAsync(
    assistantId: string,
    dto: ProcessMessageDto,
  ): Promise<AsyncResponse> {
    return this.request<AsyncResponse>(
      `/api/v1/assistants/${assistantId}/messages?async=true${dto.skipSummarization ? "&skipSummarization=true" : ""}`,
      {
        method: "POST",
        body: JSON.stringify(dto),
      },
    );
  }

  /**
   * Get the list of unique tags used across this account's chat histories.
   * Backed by GET /api/v1/assistants/tags. Useful for autocompletion / filters.
   */
  async getChatTags(): Promise<string[]> {
    return this.request<string[]>(`/api/v1/assistants/tags`);
  }

  /**
   * Get real-time chat history (for polling in async mode)
   */
  async getRealtimeHistory(
    assistantId: string,
    chatUid: string,
  ): Promise<RealtimeChatHistory> {
    return this.request<RealtimeChatHistory>(
      `/api/v1/assistants/${assistantId}/chats/${chatUid}/realtime`,
    );
  }

  /**
   * Get chat history for a specific conversation
   */
  async getChatHistory(
    assistantId: string,
    chatUid: string,
    options?: { tenantId?: string },
  ): Promise<ChatHistory> {
    const params = new URLSearchParams();
    if (options?.tenantId) {
      params.set("tenantId", options.tenantId);
    }
    const query = params.toString();
    return this.request<ChatHistory>(
      `/api/v1/assistants/${assistantId}/chats/${chatUid}${query ? `?${query}` : ""}`,
    );
  }

  /**
   * List conversations for an assistant
   */
  async listConversations(
    assistantId: string,
    options?: {
      tenantId?: string;
      subtenantId?: string;
      offset?: number;
      limit?: number;
    },
  ): Promise<ListConversationsResponse> {
    const params = new URLSearchParams();
    if (options?.tenantId) {
      params.set("tenantId", options.tenantId);
    }
    if (options?.subtenantId) {
      params.set("subtenantId", options.subtenantId);
    }
    if (options?.offset != null) {
      params.set("offset", String(options.offset));
    }
    if (options?.limit != null) {
      params.set("limit", String(options.limit));
    }
    params.set("omitContent", "true");
    const query = params.toString();
    return this.request<ListConversationsResponse>(
      `/api/v1/assistants/${assistantId}/chats${query ? `?${query}` : ""}`,
    );
  }

  /**
   * Send tool call responses back to the assistant
   */
  async sendToolResponses(
    assistantId: string,
    chatUid: string,
    responses: ToolCallResponse[],
  ): Promise<AsyncResponse> {
    return this.request<AsyncResponse>(
      `/api/v1/assistants/${assistantId}/chats/${chatUid}/tool-response`,
      {
        method: "POST",
        body: JSON.stringify({ responses }),
      },
    );
  }

  /**
   * Submit feedback for a chat message
   */
  async submitChatFeedback(
    assistantId: string,
    chatUid: string,
    data: FeedbackSubmission,
  ): Promise<FeedbackEntry> {
    return this.request<FeedbackEntry>(
      `/api/v1/assistants/${assistantId}/chats/${chatUid}/feedback`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
  }

  /**
   * Get all feedback for a chat
   */
  async getChatFeedback(
    assistantId: string,
    chatUid: string,
  ): Promise<FeedbackEntry[]> {
    return this.request<FeedbackEntry[]>(
      `/api/v1/assistants/${assistantId}/chats/${chatUid}/feedback`,
    );
  }

  /**
   * Get an agent thread by ID
   */
  async getThreadById(
    threadId: string,
    withTasks = false,
  ): Promise<AgentThreadDto> {
    const query = withTasks ? "?withTasks=true" : "";
    return this.request<AgentThreadDto>(
      `/api/v1/agents/threads/${threadId}${query}`,
    );
  }

  /**
   * Get agent details
   */
  async getAgentDetails(agentId: string): Promise<AgentDto> {
    return this.request<AgentDto>(`/api/v1/agents/${agentId}`);
  }

  /**
   * Get an AI-generated explanation of a thread's execution
   */
  async explainAgentThread(threadId: string): Promise<string> {
    return this.request<string>(
      `/api/v1/agents/threads/${threadId}/explain`,
    );
  }

  /**
   * Pause or resume a thread
   */
  async pauseResumeThread(
    threadId: string,
    action: "paused" | "queued",
  ): Promise<void> {
    return this.request<void>(
      `/api/v1/agents/threads/${threadId}/pause-resume`,
      {
        method: "POST",
        body: JSON.stringify({ action }),
      },
    );
  }

  /**
   * Handle thread approval (approve/reject)
   */
  async handleThreadApproval(
    threadId: string,
    approved: boolean,
    retry: boolean,
    message: string,
  ): Promise<void> {
    return this.request<void>(
      `/api/v1/agents/threads/${threadId}/approval`,
      {
        method: "POST",
        body: JSON.stringify({
          action: approved ? "approved" : "rejected",
          message,
          retry,
        }),
      },
    );
  }

  /**
   * Manually complete a thread
   */
  async completeThread(
    threadId: string,
    completionState: string,
  ): Promise<void> {
    return this.request<void>(
      `/api/v1/agents/threads/${threadId}/complete`,
      {
        method: "POST",
        body: JSON.stringify({ state: completionState }),
      },
    );
  }

  /**
   * Continue an existing thread with a new user message. The backend decides how
   * to apply it based on the thread state: a finished/failed/waiting thread is
   * re-queued and re-run with the message appended, while a running/queued thread
   * receives it on its next turn (right after the pending tool response). Returns
   * the updated thread.
   */
  async sendThreadMessage(
    threadId: string,
    message: string | Record<string, unknown>,
  ): Promise<AgentThreadDto> {
    return this.request<AgentThreadDto>(
      `/api/v1/agents/threads/${threadId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ message }),
      },
    );
  }

  /**
   * Stop an in-progress async chat.
   * The current LLM call or tool execution will finish, then the chat
   * will be marked as completed with the history accumulated so far.
   */
  async stopChat(
    assistantId: string,
    chatUid: string,
  ): Promise<{ chatUid: string; message: string }> {
    return this.request<{ chatUid: string; message: string }>(
      `/api/v1/assistants/${assistantId}/chats/${chatUid}/stop`,
      { method: "POST" },
    );
  }

  /**
   * Upload a file and get a download URL
   */
  async uploadFile(
    file: File,
    isRetry = false,
  ): Promise<{ name: string; downloadUrl: string; fileType: string }> {
    const url = `${this.config.baseUrl}/api/v1/files/upload`;

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.authorization(isRetry)}`,
        "devic-api-source": "ui",
      },
      body: formData,
    });

    // The FormData is rebuilt from `file` on the way back in, so unlike a
    // consumed stream this retry is safe.
    if (response.status === 401 && this.config.getToken && !isRetry) {
      return this.uploadFile(file, true);
    }

    if (!response.ok) {
      let errorData: { statusCode: number; message: string };
      try {
        errorData = await response.json();
      } catch {
        errorData = {
          statusCode: response.status,
          message: response.statusText,
        };
      }
      throw new DevicApiError(errorData);
    }

    const data = await response.json();
    if (data && typeof data === "object" && "data" in data) {
      return data.data;
    }
    return data;
  }

  /**
   * Transcribe audio to text using the /whisper endpoint.
   * Accepts either an audio binary (Blob/File, sent as multipart/form-data) or
   * a download URL string (sent as `audioUrl`). The backend stores the binary
   * and runs speech-to-text with Devic's own OpenAI key. Returns the text and a
   * `transcriptId` to attach to the resulting message.
   */
  async transcribeAudio(
    audio: Blob | string,
    options?: {
      language?: string;
      messageUid?: string;
      chatUid?: string;
      tenantId?: string;
      fileName?: string;
    },
    isRetry = false,
  ): Promise<WhisperTranscriptionResponse> {
    const url = `${this.config.baseUrl}/api/v1/whisper`;

    const formData = new FormData();
    if (typeof audio === "string") {
      formData.append("audioUrl", audio);
    } else {
      formData.append("audio", audio, options?.fileName || "recording.webm");
    }
    if (options?.language) formData.append("language", options.language);
    if (options?.messageUid) formData.append("messageUid", options.messageUid);
    if (options?.chatUid) formData.append("chatUid", options.chatUid);
    if (options?.tenantId) formData.append("tenantId", options.tenantId);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.authorization(isRetry)}`,
        "devic-api-source": "ui",
      },
      body: formData,
    });

    if (response.status === 401 && this.config.getToken && !isRetry) {
      return this.transcribeAudio(audio, options, true);
    }

    if (!response.ok) {
      let errorData: { statusCode: number; message: string };
      try {
        errorData = await response.json();
      } catch {
        errorData = {
          statusCode: response.status,
          message: response.statusText,
        };
      }
      throw new DevicApiError(errorData);
    }

    const data = await response.json();
    if (data && typeof data === "object" && "data" in data) {
      return data.data;
    }
    return data;
  }

  /**
   * Fetch a single speech-to-text transcript by its id (the `transcriptId`
   * stored on a message). Returns the transcribed text and the download URL of
   * the source audio so the chat can offer playback of a dictated message.
   */
  async getTranscript(
    transcriptId: string,
  ): Promise<WhisperTranscriptionResponse> {
    return this.request<WhisperTranscriptionResponse>(
      `/api/v1/whisper/${encodeURIComponent(transcriptId)}`,
    );
  }

  /**
   * Get chat history content (full conversation after handoff)
   */
  async getChatHistoryContent(
    assistantId: string,
    chatUid: string,
  ): Promise<ChatMessage[]> {
    return this.request<ChatMessage[]>(
      `/api/v1/assistants/${assistantId}/chats/${chatUid}/content`,
    );
  }

  /**
   * Get the current usage limits + consumption for a tenant (or a specific
   * subtenant). Read-only — backed by `GET /api/v1/tenant-usage/:tenantId`
   * (or `/:tenantId/subtenants/:subtenantId`), which is part of the devic-ui
   * key preset. Returns the effective rules with their live consumption and the
   * active tier. Use it to render a usage bar.
   */
  async getTenantUsage(
    tenantId: string,
    subtenantId?: string,
  ): Promise<TenantUsage> {
    const path = subtenantId
      ? `/api/v1/tenant-usage/${encodeURIComponent(tenantId)}/subtenants/${encodeURIComponent(subtenantId)}`
      : `/api/v1/tenant-usage/${encodeURIComponent(tenantId)}`;
    return this.request<TenantUsage>(path);
  }

  /**
   * Get the durable per-window usage history for a tenant (or subtenant).
   * Read-only — backed by `GET /api/v1/tenant-usage/:tenantId/history`.
   */
  async getTenantUsageHistory(
    tenantId: string,
    options?: TenantUsageHistoryQuery,
  ): Promise<TenantUsageHistoryRow[]> {
    const params = new URLSearchParams();
    if (options?.subtenantId) params.set("subtenantId", options.subtenantId);
    if (options?.scope) params.set("scope", options.scope);
    if (options?.metric) params.set("metric", options.metric);
    if (options?.windowUnit) params.set("windowUnit", options.windowUnit);
    if (options?.from != null) params.set("from", String(options.from));
    if (options?.to != null) params.set("to", String(options.to));
    if (options?.limit != null) params.set("limit", String(options.limit));
    if (options?.skip != null) params.set("skip", String(options.skip));
    const query = params.toString();
    return this.request<TenantUsageHistoryRow[]>(
      `/api/v1/tenant-usage/${encodeURIComponent(tenantId)}/history${query ? `?${query}` : ""}`,
    );
  }

  private coreMemoryPath(
    assistantId: string,
    tenantId?: string,
    subtenantId?: string,
    entryId?: number,
  ): string {
    const params = new URLSearchParams();
    if (tenantId) params.set("tenantId", tenantId);
    if (subtenantId) params.set("subtenantId", subtenantId);
    const query = params.toString();
    return `/api/v1/memory/assistants/${encodeURIComponent(assistantId)}/core${
      entryId != null ? `/${entryId}` : ""
    }${query ? `?${query}` : ""}`;
  }

  /**
   * Core memory entries of the bucket the assistant resolves for a
   * tenant/subtenant combination — what the assistant permanently remembers
   * there. `enabled: false` when the assistant has no core memory tier.
   */
  async getCoreMemory(
    assistantId: string,
    options?: { tenantId?: string; subtenantId?: string },
  ): Promise<CoreMemoryList> {
    return this.request<CoreMemoryList>(
      this.coreMemoryPath(assistantId, options?.tenantId, options?.subtenantId),
    );
  }

  /** Add a standing core memory entry to the assistant's resolved bucket. */
  async addCoreMemoryEntry(
    assistantId: string,
    entry: { content: string; section?: string; pinned?: boolean },
    options?: { tenantId?: string; subtenantId?: string },
  ): Promise<{ entry?: CoreMemoryEntry; deduped: boolean }> {
    return this.request(
      this.coreMemoryPath(assistantId, options?.tenantId, options?.subtenantId),
      { method: "POST", body: JSON.stringify(entry) },
    );
  }

  /** Edit the text, section or pinned flag of a core memory entry. */
  async updateCoreMemoryEntry(
    assistantId: string,
    entryId: number,
    patch: { content?: string; section?: string; pinned?: boolean },
    options?: { tenantId?: string; subtenantId?: string },
  ): Promise<CoreMemoryEntry> {
    return this.request<CoreMemoryEntry>(
      this.coreMemoryPath(
        assistantId,
        options?.tenantId,
        options?.subtenantId,
        entryId,
      ),
      { method: "PATCH", body: JSON.stringify(patch) },
    );
  }

  /** Remove (archive) a core memory entry. */
  async deleteCoreMemoryEntry(
    assistantId: string,
    entryId: number,
    options?: { tenantId?: string; subtenantId?: string },
  ): Promise<{ removed: boolean; id?: number }> {
    return this.request(
      this.coreMemoryPath(
        assistantId,
        options?.tenantId,
        options?.subtenantId,
        entryId,
      ),
      { method: "DELETE" },
    );
  }

  // ── Connected apps of the end user ────────────────────────────────
  //
  // Backed by `/api/v1/tenant-integrations`: the tenant is resolved on the
  // server and never taken from the path. The tenant/subtenant sent here
  // identify the end user in front of the widget, so one tenant's accounts are
  // never reachable from another's.

  private integrationsQuery(options: {
    assistantId: string;
    tenantId?: string;
    subtenantId?: string;
    returnTo?: string;
  }): string {
    const params = new URLSearchParams({ assistantId: options.assistantId });
    if (options.tenantId) params.set("tenantId", options.tenantId);
    if (options.subtenantId) params.set("subtenantId", options.subtenantId);
    if (options.returnTo) params.set("returnTo", options.returnTo);
    return params.toString();
  }

  /** Apps this assistant offers, with the end user's own connection status. */
  async getIntegrations(options: {
    assistantId: string;
    tenantId?: string;
    subtenantId?: string;
  }): Promise<Integration[]> {
    return this.request<Integration[]>(
      `/api/v1/tenant-integrations?${this.integrationsQuery(options)}`,
    );
  }

  /**
   * Starts connecting an account. Returns the URL to open in a popup.
   *
   * `returnTo` is where the callback posts the result back to, and the server
   * refuses any value that does not match the origin this request came from —
   * so it cannot be turned into an open redirector.
   */
  async connectIntegration(
    app: string,
    options: {
      assistantId: string;
      tenantId?: string;
      subtenantId?: string;
      returnTo?: string;
    },
  ): Promise<{ authorizationUrl: string }> {
    return this.request<{ authorizationUrl: string }>(
      `/api/v1/tenant-integrations/${encodeURIComponent(app)}/connect?${this.integrationsQuery(options)}`,
      { method: "POST" },
    );
  }

  /** Disconnects one of the end user's own accounts. */
  async disconnectIntegration(
    accountId: string,
    options: {
      assistantId: string;
      tenantId?: string;
      subtenantId?: string;
    },
  ): Promise<{ disconnected: boolean }> {
    return this.request(
      `/api/v1/tenant-integrations/accounts/${encodeURIComponent(accountId)}?${this.integrationsQuery(options)}`,
      { method: "DELETE" },
    );
  }

  /**
   * Drops the server's short-lived cache of the end user's connections.
   *
   * Called right after the OAuth popup closes: without it the freshly connected
   * app would keep reading as disconnected until the cache expires, which looks
   * like the connection silently failed.
   */
  async refreshIntegrations(options: {
    assistantId: string;
    tenantId?: string;
    subtenantId?: string;
  }): Promise<{ refreshed: boolean }> {
    return this.request(
      `/api/v1/tenant-integrations/refresh?${this.integrationsQuery(options)}`,
      { method: "POST" },
    );
  }
}

/**
 * Custom error class for API errors
 */
export class DevicApiError extends Error {
  public statusCode: number;
  public errorType?: string;
  /** Structured error details (e.g. usage-limit blocking info on a 429). */
  public details?: any;

  constructor(error: ApiError) {
    super(error.message);
    this.name = "DevicApiError";
    this.statusCode = error.statusCode;
    this.errorType = error.error;
    this.details = error.details;
  }
}

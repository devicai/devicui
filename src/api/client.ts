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
} from "./types";

export interface DevicApiClientConfig {
  apiKey: string;
  baseUrl: string;
}

/**
 * Devic API client using native fetch
 */
export class DevicApiClient {
  private config: DevicApiClientConfig;

  constructor(config: DevicApiClientConfig) {
    this.config = config;
  }

  /**
   * Update client configuration
   */
  setConfig(config: Partial<DevicApiClientConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Make an authenticated request to the API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

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
    options?: { tenantId?: string },
  ): Promise<ConversationSummary[]> {
    const params = new URLSearchParams();
    if (options?.tenantId) {
      params.set("tenantId", options.tenantId);
    }
    const query = params.toString();
    const response = await this.request<ListConversationsResponse>(
      `/api/v1/assistants/${assistantId}/chats${query ? `?${query}` : ""}`,
    );
    return response.histories;
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
        body: JSON.stringify({ approved, retry, message }),
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
}

/**
 * Custom error class for API errors
 */
export class DevicApiError extends Error {
  public statusCode: number;
  public errorType?: string;

  constructor(error: ApiError) {
    super(error.message);
    this.name = "DevicApiError";
    this.statusCode = error.statusCode;
    this.errorType = error.error;
  }
}

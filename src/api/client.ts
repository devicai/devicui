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

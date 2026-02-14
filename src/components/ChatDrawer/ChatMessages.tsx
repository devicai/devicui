import React, { useState, useEffect, useRef } from "react";
import Markdown from "markdown-to-jsx";
import { MessageActions } from "../Feedback";
import { HandoffSubagentWidget } from "./HandoffSubagentWidget";
import type { ChatMessagesProps } from "./ChatDrawer.types";
import type { ChatMessage, ToolGroupConfig, ToolGroupCall } from "../../api/types";
import type { FeedbackState } from "../Feedback";
import { segmentToolCalls } from "../../utils/toolGroups";
import "../Feedback/Feedback.css";

/**
 * Format timestamp to readable time
 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Groups consecutive tool-call assistant messages (no text content)
 * into { toolMessages, isActive } groups, interleaved with regular messages.
 */
function groupMessages(
  messages: ChatMessage[],
  isLoading: boolean,
): Array<
  | { type: "message"; message: ChatMessage }
  | { type: "toolGroup"; toolMessages: ChatMessage[]; isActive: boolean }
> {
  const result: Array<
    | { type: "message"; message: ChatMessage }
    | { type: "toolGroup"; toolMessages: ChatMessage[]; isActive: boolean }
  > = [];

  let currentToolGroup: ChatMessage[] = [];

  const flushToolGroup = (isActive: boolean) => {
    if (currentToolGroup.length > 0) {
      result.push({
        type: "toolGroup",
        toolMessages: [...currentToolGroup],
        isActive,
      });
      currentToolGroup = [];
    }
  };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Skip developer and tool response messages
    if (msg.role === "developer" || msg.role === "tool") {
      continue;
    }

    const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;
    const hasText = !!msg.content?.message;
    const hasFiles = msg.content?.files && msg.content.files.length > 0;

    if (hasToolCalls) {
      // If message has both text and tool_calls, show text first
      if (hasText || hasFiles) {
        // Flush any prior tool group before inserting the text message
        const remainingMeaningful = messages
          .slice(i + 1)
          .some(
            (m) =>
              (m.role === "assistant" && m.content?.message) ||
              m.role === "user",
          );
        flushToolGroup(isLoading && !remainingMeaningful);
        result.push({ type: "message", message: msg });
      }
      // Always accumulate the tool call
      currentToolGroup.push(msg);
    } else {
      // Regular message → flush any accumulated tool group first
      const remainingMeaningful = messages
        .slice(i)
        .some(
          (m) =>
            (m.role === "assistant" && m.content?.message) || m.role === "user",
        );
      flushToolGroup(isLoading && !remainingMeaningful);

      if (hasText || hasFiles) {
        result.push({ type: "message", message: msg });
      }
    }
  }

  // Flush remaining tool group (is active if still loading)
  flushToolGroup(isLoading);

  return result;
}

/**
 * Collapsible tool actions group
 */
function ToolGroup({
  toolMessages,
  isActive,
  allMessages,
  toolRenderers,
  toolIcons,
  toolGroups,
  handedOffSubThreadId,
  onHandoffCompleted,
  handoffWidgetRenderer,
  apiKey,
  baseUrl,
}: {
  toolMessages: ChatMessage[];
  isActive: boolean;
  allMessages?: ChatMessage[];
  toolRenderers?: Record<string, (input: any, output: any) => React.ReactNode>;
  toolIcons?: Record<string, React.ReactNode>;
  toolGroups?: ToolGroupConfig[];
  handedOffSubThreadId?: string;
  onHandoffCompleted?: () => void;
  handoffWidgetRenderer?: ChatMessagesProps["handoffWidgetRenderer"];
  apiKey?: string;
  baseUrl?: string;
}): JSX.Element {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const shouldCollapse = toolMessages.length > 3 && !isActive;

  // Auto-collapse when transitioning from active to completed
  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    if (wasActiveRef.current && !isActive && toolMessages.length > 3) {
      setIsCollapsed(true);
    }
    wasActiveRef.current = isActive;
  }, [isActive, toolMessages.length]);

  const lastIndex = toolMessages.length - 1;

  const renderToolItem = (
    msg: ChatMessage,
    opts: { active?: boolean; showSpinner?: boolean },
  ) => {
    const toolCall = msg.tool_calls?.[0];
    const toolName = toolCall?.function?.name;
    const summaryText =
      msg.summary || toolName || (opts.active ? "Processing..." : "Completed");

    // Render HandoffSubagentWidget for hand_off_subagent tool calls
    if (toolName === "hand_off_subagent" && toolCall && allMessages) {
      const subThreadId = extractSubThreadId(
        toolCall.id,
        allMessages,
        handedOffSubThreadId,
      );
      if (subThreadId) {
        return (
          <HandoffSubagentWidget
            subThreadId={subThreadId}
            onCompleted={onHandoffCompleted}
            renderWidget={handoffWidgetRenderer}
            apiKey={apiKey}
            baseUrl={baseUrl}
          />
        );
      }
    }

    // Custom renderer for completed tools
    if (!opts.active && toolName && toolRenderers?.[toolName] && allMessages) {
      const toolResponse = allMessages.find(
        (m) => m.role === "tool" && m.tool_call_id === toolCall!.id,
      );
      let input: any = {};
      try {
        input = JSON.parse(toolCall!.function.arguments);
      } catch {}
      const output =
        toolResponse?.content?.data ||
        toolResponse?.content?.message ||
        toolResponse?.content;
      return toolRenderers[toolName](input, output);
    }

    const icon = opts.showSpinner ? (
      <SpinnerIcon />
    ) : (
      (toolName && toolIcons?.[toolName]) || <ToolDoneIcon />
    );

    return (
      <>
        <span className="devic-tool-activity-icon">{icon}</span>
        <span
          className={`devic-tool-activity-text ${opts.active ? "devic-glow-text" : ""}`}
        >
          {summaryText}
        </span>
      </>
    );
  };

  /** Resolve a ChatMessage into a ToolGroupCall */
  const resolveToolGroupCall = (msg: ChatMessage): ToolGroupCall | null => {
    const toolCall = msg.tool_calls?.[0];
    if (!toolCall) return null;
    const toolName = toolCall.function?.name;
    let input: any = {};
    try {
      input = JSON.parse(toolCall.function.arguments);
    } catch {}
    const toolResponse = allMessages?.find(
      (m) => m.role === "tool" && m.tool_call_id === toolCall.id,
    );
    const output =
      toolResponse?.content?.data ||
      toolResponse?.content?.message ||
      toolResponse?.content;
    return { name: toolName, input, output, toolCallId: toolCall.id };
  };

  /** Render completed tool messages, applying toolGroups segmentation when configured */
  const renderCompletedItems = (msgs: ChatMessage[]) => {
    if (!toolGroups || toolGroups.length === 0) {
      return msgs.map((msg) => (
        <div key={msg.uid} className="devic-tool-activity">
          {renderToolItem(msg, {})}
        </div>
      ));
    }

    // Build ToolGroupCall array for completed messages
    const calls: Array<{ msg: ChatMessage; call: ToolGroupCall }> = [];
    for (const msg of msgs) {
      const call = resolveToolGroupCall(msg);
      if (call) {
        calls.push({ msg, call });
      }
    }

    const segments = segmentToolCalls(
      calls.map((c) => c.call),
      toolGroups,
    );

    const elements: React.ReactNode[] = [];
    let callIdx = 0;

    for (const segment of segments) {
      if (segment.type === "group") {
        const groupKey = segment.calls
          .map((c) => c.toolCallId)
          .join("-");
        elements.push(
          <div key={`tg-group-${groupKey}`} className="devic-tool-activity devic-tool-activity--grouped">
            {segment.config.renderer(segment.calls)}
          </div>,
        );
        callIdx += segment.calls.length;
      } else {
        const entry = calls[callIdx];
        elements.push(
          <div key={entry.msg.uid} className="devic-tool-activity">
            {renderToolItem(entry.msg, {})}
          </div>,
        );
        callIdx += 1;
      }
    }

    return elements;
  };

  // If active, show all items; last one gets the glow treatment
  if (isActive) {
    // For active groups: render all completed items with grouping, then render the active (last) item individually
    const completedMessages = toolMessages.slice(0, lastIndex);
    const lastMsg = toolMessages[lastIndex];

    return (
      <div className="devic-tool-group">
        {completedMessages.length > 0 && renderCompletedItems(completedMessages)}
        <div
          key={lastMsg.uid}
          className="devic-tool-activity devic-tool-activity--active"
        >
          {renderToolItem(lastMsg, { active: true, showSpinner: true })}
        </div>
      </div>
    );
  }

  // Completed: collapse if > 3 actions
  if (shouldCollapse && isCollapsed) {
    return (
      <div className="devic-tool-group">
        <button
          className="devic-tool-collapse-btn"
          onClick={() => setIsCollapsed(false)}
          type="button"
        >
          <ToolDoneIcon />
          <span>{toolMessages.length} actions</span>
          <ChevronDownIcon />
        </button>
      </div>
    );
  }

  return (
    <div className="devic-tool-group">
      {shouldCollapse && (
        <button
          className="devic-tool-collapse-btn"
          onClick={() => setIsCollapsed(true)}
          type="button"
        >
          <span>{toolMessages.length} actions</span>
          <ChevronUpIcon />
        </button>
      )}
      <div className="devic-tool-group-items" data-expanded="true">
        {renderCompletedItems(toolMessages)}
      </div>
    </div>
  );
}

/**
 * Messages list component
 */
const markdownOverrides = {
  table: {
    component: ({ children, ...props }: any) =>
      React.createElement(
        "div",
        { className: "markdown-table" },
        React.createElement("table", props, children),
      ),
  },
};

/**
 * Extract subthread ID from a hand_off_subagent tool call.
 * Checks the tool response in allMessages first, then falls back to handedOffSubThreadId.
 */
function extractSubThreadId(
  toolCallId: string,
  allMessages: ChatMessage[],
  handedOffSubThreadId?: string,
): string | null {
  // Look for the tool response message
  const toolResponse = allMessages.find(
    (m) => m.role === "tool" && m.tool_call_id === toolCallId,
  );
  if (toolResponse) {
    const content = toolResponse.content?.data || toolResponse.content;
    if (content && typeof content === "object" && "subthreadId" in content) {
      return (content as any).subthreadId;
    }
    if (content && typeof content === "object" && "subThreadId" in content) {
      return (content as any).subThreadId;
    }
  }
  // Fall back to active handoff subthread ID
  return handedOffSubThreadId || null;
}

export function ChatMessages({
  messages,
  allMessages,
  isLoading,
  welcomeMessage,
  suggestedMessages,
  onSuggestedClick,
  toolRenderers,
  toolIcons,
  loadingIndicator,
  showFeedback = true,
  feedbackMap,
  onFeedback,
  handedOffSubThreadId,
  onHandoffCompleted,
  handoffWidgetRenderer,
  toolGroups,
  apiKey,
  baseUrl,
}: ChatMessagesProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(messages.length);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    prevLengthRef.current = messages.length;
  }, [messages.length, isLoading]);

  const grouped = groupMessages(messages, isLoading);

  // Show loading dots only if there's no active tool group at the end
  const lastGroup = grouped[grouped.length - 1];
  const showLoadingDots =
    isLoading && !(lastGroup?.type === "toolGroup" && lastGroup.isActive);

  return (
    <div className="devic-messages-container" ref={containerRef}>
      {messages.length === 0 &&
        !isLoading &&
        (welcomeMessage || suggestedMessages?.length) && (
          <div className="devic-welcome">
            {welcomeMessage && (
              <p className="devic-welcome-text">{welcomeMessage}</p>
            )}
            {suggestedMessages && suggestedMessages.length > 0 && (
              <div className="devic-suggested-messages">
                {suggestedMessages.map((msg, idx) => (
                  <button
                    key={idx}
                    className="devic-suggested-btn"
                    onClick={() => onSuggestedClick?.(msg)}
                  >
                    {msg}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

      {grouped.map((item) => {
        if (item.type === "toolGroup") {
          return (
            <ToolGroup
              key={`tg-${item.toolMessages[0].uid}`}
              toolMessages={item.toolMessages}
              isActive={item.isActive}
              allMessages={allMessages}
              toolRenderers={toolRenderers}
              toolIcons={toolIcons}
              toolGroups={toolGroups}
              handedOffSubThreadId={handedOffSubThreadId}
              onHandoffCompleted={onHandoffCompleted}
              handoffWidgetRenderer={handoffWidgetRenderer}
              apiKey={apiKey}
              baseUrl={baseUrl}
            />
          );
        }

        const message = item.message;
        const messageText = message.content?.message;
        const hasFiles =
          message.content?.files && message.content.files.length > 0;
        const isAssistant = message.role === "assistant";
        const currentFeedback = feedbackMap?.get(message.uid) || "none";

        return (
          <div
            key={message.uid}
            className="devic-message"
            data-role={message.role}
          >
            <div className="devic-message-bubble">
              {messageText && isAssistant ? (
                <Markdown options={{ overrides: markdownOverrides }}>
                  {messageText}
                </Markdown>
              ) : (
                messageText
              )}
              {hasFiles && (
                <div className="devic-message-files">
                  {message.content!.files!.map((file, fileIdx) => (
                    <div key={fileIdx} className="devic-message-file">
                      <FileIcon />
                      <span>{file.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="devic-message-footer">
              <span className="devic-message-time">
                {formatTime(message.timestamp)}
              </span>
              {isAssistant && showFeedback && onFeedback && (
                <MessageActions
                  messageId={message.uid}
                  messageContent={messageText}
                  currentFeedback={currentFeedback as FeedbackState}
                  onFeedback={onFeedback}
                  showCopy={true}
                  showFeedback={true}
                />
              )}
            </div>
          </div>
        );
      })}

      {showLoadingDots &&
        (loadingIndicator ? (
          <div className="devic-loading">{loadingIndicator}</div>
        ) : (
          <div className="devic-loading">
            <span className="devic-loading-dot"></span>
            <span className="devic-loading-dot"></span>
            <span className="devic-loading-dot"></span>
          </div>
        ))}
    </div>
  );
}

/* ── Icons ── */

function SpinnerIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className="devic-spinner"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function ToolDoneIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20,6 9,17 4,12" />
    </svg>
  );
}

function ChevronDownIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6,9 12,15 18,9" />
    </svg>
  );
}

function ChevronUpIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6,15 12,9 18,15" />
    </svg>
  );
}

function FileIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
    </svg>
  );
}

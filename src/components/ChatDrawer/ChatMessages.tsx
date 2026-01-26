import React, { useEffect, useRef } from 'react';
import type { ChatMessagesProps } from './ChatDrawer.types';
import { ToolTimeline } from './ToolTimeline';

/**
 * Format timestamp to readable time
 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Messages list component
 */
export function ChatMessages({
  messages,
  isLoading,
  welcomeMessage,
  suggestedMessages,
  onSuggestedClick,
  showToolTimeline = true,
}: ChatMessagesProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(messages.length);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > lastMessageCountRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length]);

  // Extract tool calls for timeline
  const toolCalls = showToolTimeline
    ? messages
        .filter((m) => m.tool_calls?.length)
        .flatMap((m) =>
          m.tool_calls!.map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            status: 'completed' as const,
            timestamp: m.timestamp,
          }))
        )
    : [];

  return (
    <div className="devic-messages-container" ref={containerRef}>
      {messages.length === 0 && (welcomeMessage || suggestedMessages?.length) && (
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

      {messages.map((message) => {
        // Skip tool messages in main display (shown in timeline)
        if (message.role === 'tool' && showToolTimeline) {
          return null;
        }

        return (
          <div
            key={message.uid}
            className="devic-message"
            data-role={message.role}
          >
            <div className="devic-message-bubble">
              {message.content.message}
              {message.content.files && message.content.files.length > 0 && (
                <div className="devic-message-files">
                  {message.content.files.map((file, idx) => (
                    <div key={idx} className="devic-message-file">
                      <FileIcon />
                      <span>{file.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <span className="devic-message-time">
              {formatTime(message.timestamp)}
            </span>
          </div>
        );
      })}

      {showToolTimeline && toolCalls.length > 0 && (
        <ToolTimeline toolCalls={toolCalls} />
      )}

      {isLoading && (
        <div className="devic-loading">
          <span className="devic-loading-dot"></span>
          <span className="devic-loading-dot"></span>
          <span className="devic-loading-dot"></span>
        </div>
      )}
    </div>
  );
}

/**
 * Simple file icon
 */
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

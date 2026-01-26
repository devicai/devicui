import React from 'react';
import type { ToolTimelineProps } from './ChatDrawer.types';

/**
 * Tool execution timeline component
 */
export function ToolTimeline({ toolCalls }: ToolTimelineProps): JSX.Element | null {
  if (toolCalls.length === 0) {
    return null;
  }

  return (
    <div className="devic-tool-timeline">
      {toolCalls.map((tool) => (
        <div key={tool.id} className="devic-tool-item">
          <span className="devic-tool-status" data-status={tool.status} />
          <span className="devic-tool-name">{formatToolName(tool.name)}</span>
          {tool.status === 'error' && tool.error && (
            <span className="devic-tool-error">{tool.error}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Format tool name for display
 */
function formatToolName(name: string): string {
  // Convert snake_case or camelCase to Title Case with spaces
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

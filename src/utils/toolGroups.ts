import type { ToolGroupCall, ToolGroupConfig } from '../api/types';

export type ToolGroupSegment =
  | { type: 'group'; config: ToolGroupConfig; calls: ToolGroupCall[] }
  | { type: 'single'; call: ToolGroupCall; index: number };

/**
 * Partition an array of tool calls into grouped and ungrouped sub-sequences
 * based on the provided toolGroups configuration.
 *
 * Consecutive calls matching the same ToolGroupConfig are accumulated into a single group segment.
 * When a call doesn't match any config, or matches a different config, the current group is flushed.
 */
export function segmentToolCalls(
  calls: ToolGroupCall[],
  toolGroups: ToolGroupConfig[],
): ToolGroupSegment[] {
  const segments: ToolGroupSegment[] = [];
  let currentConfig: ToolGroupConfig | null = null;
  let currentGroup: ToolGroupCall[] = [];

  const flush = () => {
    if (currentGroup.length > 0 && currentConfig) {
      segments.push({ type: 'group', config: currentConfig, calls: currentGroup });
      currentGroup = [];
      currentConfig = null;
    }
  };

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    const matchingConfig = toolGroups.find((g) => g.tools.includes(call.name));

    if (matchingConfig) {
      if (currentConfig === matchingConfig) {
        // Same group, accumulate
        currentGroup.push(call);
      } else {
        // Different group or starting a new one
        flush();
        currentConfig = matchingConfig;
        currentGroup = [call];
      }
    } else {
      // No matching config — flush any pending group, emit as single
      flush();
      segments.push({ type: 'single', call, index: i });
    }
  }

  flush();

  return segments;
}

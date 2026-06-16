import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DevicApiClient } from '../../api/client';
import type { TenantUsageRule } from '../../api/types';

/**
 * Props for the UsageBar component.
 */
export interface UsageBarProps {
  /** API key (resolved from provider by the ChatDrawer). */
  apiKey?: string;
  /** Base URL (resolved from provider by the ChatDrawer). */
  baseUrl?: string;
  /** Tenant whose usage is displayed. Required — without it the bar renders nothing. */
  tenantId?: string;
  /** Optional subtenant to scope the usage to a specific end user. */
  subtenantId?: string;
  /**
   * Display mode:
   * - 'always': the bar is always visible.
   * - 'onDemand': a small toggle button is shown; the bar appears on click.
   */
  mode?: 'always' | 'onDemand';
  /** Restrict the bar to a single metric. When omitted, the most utilized rule wins. */
  metric?: 'tokens' | 'cost';
  /** Primary color for the bar fill (below the warning threshold). */
  color?: string;
  /**
   * Changes to this value trigger a refetch (e.g. the message count, so the bar
   * refreshes after each assistant turn).
   */
  refreshKey?: number | string;
  /** Enable debug logging of fetch errors to the console. */
  debug?: boolean;
}

const WARN_THRESHOLD = 90;

function fillColor(percent: number, base: string): string {
  if (percent >= 100) return '#ff4d4f';
  if (percent >= WARN_THRESHOLD) return '#faad14';
  return base;
}

function formatAmount(value: number, metric: 'tokens' | 'cost'): string {
  if (metric === 'cost') {
    return `$${value.toFixed(value < 1 ? 4 : 2)}`;
  }
  return Math.round(value).toLocaleString();
}

function windowLabel(unit: string, every: number): string {
  const u = every > 1 ? `${unit}s` : unit;
  return every > 1 ? `every ${every} ${u}` : `per ${unit}`;
}

function resetLabel(resetsAt?: number): string {
  if (!resetsAt) return '';
  const ms = resetsAt - Date.now();
  if (ms <= 0) return 'resets now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `resets in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `resets in ${hours}h`;
  const days = Math.round(hours / 24);
  return `resets in ${days}d`;
}

/**
 * Pick the rule with the highest utilization (optionally filtered by metric).
 */
function pickRule(
  rules: TenantUsageRule[],
  metric?: 'tokens' | 'cost',
): TenantUsageRule | null {
  const pool = metric ? rules.filter((r) => r.metric === metric) : rules;
  if (pool.length === 0) return null;
  return pool.reduce((max, r) => (r.percent > max.percent ? r : max), pool[0]);
}

/**
 * A thin usage bar showing the most utilized tenant/subtenant usage window.
 * Rendered above the chat input. Antd-free — styled via `.devic-usage-*` classes.
 * Renders nothing when there are no usage limits configured for the tenant.
 */
export function UsageBar({
  apiKey,
  baseUrl,
  tenantId,
  subtenantId,
  mode = 'always',
  metric,
  color = '#1890ff',
  refreshKey,
  debug = false,
}: UsageBarProps): JSX.Element | null {
  const client = useMemo(() => {
    if (!apiKey) return null;
    return new DevicApiClient({
      apiKey,
      baseUrl: baseUrl || 'https://api.devic.ai',
    });
  }, [apiKey, baseUrl]);

  const [rule, setRule] = useState<TenantUsageRule | null>(null);
  const [loaded, setLoaded] = useState(false);
  // onDemand starts hidden; 'always' is effectively visible from the start.
  const [visible, setVisible] = useState(mode !== 'onDemand');

  const fetchUsage = useCallback(async () => {
    if (!client || !tenantId) return;
    try {
      const data = await client.getTenantUsage(tenantId, subtenantId);
      setRule(pickRule(data?.usage || [], metric));
    } catch (err) {
      if (debug) console.warn('[UsageBar] getTenantUsage failed:', err);
      setRule(null);
    } finally {
      setLoaded(true);
    }
  }, [client, tenantId, subtenantId, metric, debug]);

  useEffect(() => {
    if (!visible) return;
    void fetchUsage();
  }, [visible, fetchUsage, refreshKey]);

  if (!tenantId || !client) return null;

  // onDemand, collapsed: show a small toggle button.
  if (mode === 'onDemand' && !visible) {
    return (
      <div className="devic-usage-bar-wrap" data-mode="onDemand">
        <button
          type="button"
          className="devic-usage-toggle"
          onClick={() => setVisible(true)}
          title="Show usage"
        >
          <GaugeIcon />
          <span>Usage</span>
        </button>
      </div>
    );
  }

  // No configured limits (or not loaded yet with nothing to show): render nothing
  // in 'always' mode; in expanded onDemand, show a subtle note so the toggle isn't
  // confusing.
  if (!rule) {
    if (mode === 'onDemand' && loaded) {
      return (
        <div className="devic-usage-bar-wrap" data-mode="onDemand">
          <div className="devic-usage-bar" data-empty="true">
            <span className="devic-usage-bar-label">No usage limits</span>
            <button
              type="button"
              className="devic-usage-collapse"
              onClick={() => setVisible(false)}
              title="Hide usage"
              aria-label="Hide usage"
            >
              &times;
            </button>
          </div>
        </div>
      );
    }
    return null;
  }

  const pct = Math.min(100, Math.round(rule.percent));
  const fill = fillColor(pct, color);
  const amount = `${formatAmount(rule.current, rule.metric)} / ${formatAmount(
    rule.limit,
    rule.metric,
  )} ${rule.metric}`;
  const reset = resetLabel(rule.resetsAt);
  const title = `${amount} · ${windowLabel(rule.windowUnit, rule.windowEvery)}${
    reset ? ` · ${reset}` : ''
  }`;

  return (
    <div className="devic-usage-bar-wrap" data-mode={mode}>
      <div className="devic-usage-bar" title={title} data-state={pct >= 100 ? 'exceeded' : 'ok'}>
        <span className="devic-usage-bar-label">
          {rule.scope === 'subtenant' ? 'Your usage' : 'Usage'} {pct}%
        </span>
        <div className="devic-usage-bar-track">
          <div
            className="devic-usage-bar-fill"
            style={{ width: `${pct}%`, backgroundColor: fill }}
          />
        </div>
        {reset && <span className="devic-usage-bar-reset">{reset}</span>}
        {mode === 'onDemand' && (
          <button
            type="button"
            className="devic-usage-collapse"
            onClick={() => setVisible(false)}
            title="Hide usage"
            aria-label="Hide usage"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
}

/** Small gauge icon for the on-demand toggle. */
function GaugeIcon(): JSX.Element {
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
      <path d="M12 14a4 4 0 1 0-4-4" />
      <path d="M3 18a9 9 0 0 1 18 0" />
      <line x1="12" y1="14" x2="15" y2="11" />
    </svg>
  );
}

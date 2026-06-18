import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DevicApiClient } from '../../api/client';
import type { TenantUsage, TenantUsageRule } from '../../api/types';

/**
 * Controls what each usage row renders. All flags compose, so a developer can,
 * for example, show absolute values together with the percentage and the tier.
 */
export interface UsageBarDisplay {
  /**
   * Show the absolute amount of the active window: `current / limit metric`
   * (e.g. `1,200 / 5,000 tokens`).
   * @default false
   */
  showValues?: boolean;
  /**
   * Show the utilization percentage (e.g. `24%`).
   * @default true
   */
  showPercent?: boolean;
  /**
   * Show the temporal dimension of the window (e.g. `per 3h`, `every 3 hours`).
   * @default true
   */
  showWindow?: boolean;
  /**
   * Show the tier (plan) the limits come from, as a chip above the bar(s).
   * @default false
   */
  showTier?: boolean;
  /**
   * When more than one limit rule applies, render every rule (`true`) or only
   * the single most restrictive one (`false`, highest utilization). The
   * per-row presentation still follows the flags above.
   * @default true
   */
  showAllRules?: boolean;
}

const DEFAULT_DISPLAY: Required<UsageBarDisplay> = {
  showValues: false,
  showPercent: true,
  showWindow: true,
  showTier: false,
  showAllRules: true,
};

/**
 * Usage data handed to a `customUsageBar` renderer so a developer can build
 * their own component with the live consumption / limits.
 */
export interface UsageBarData {
  /** Tenant the usage belongs to. */
  tenantId?: string;
  /** Subtenant the usage is scoped to, if any. */
  subtenantId?: string;
  /** Tier (plan) the limits come from, if any. */
  tierId?: string;
  /**
   * Applicable usage rules (filtered by `metric` when set), sorted by
   * utilization descending — the most restrictive first.
   */
  rules: TenantUsageRule[];
  /** `true` until the first fetch resolves. */
  loading: boolean;
}

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
  /** Restrict the bar to a single metric. When omitted, all applicable rules are considered. */
  metric?: 'tokens' | 'cost';
  /**
   * What to render per rule (values / percentage / window / tier) and whether
   * to render all applicable rules or only the most restrictive one.
   */
  display?: UsageBarDisplay;
  /**
   * Render your own component instead of the built-in bar(s). Receives the live
   * usage data (rules + tier + loading) and renders in the same slot, replacing
   * the default UI entirely. When set, fetching/polling is still handled here;
   * `mode`/`display` only affect the default UI and are ignored.
   */
  customUsageBar?: (data: UsageBarData) => React.ReactNode;
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
 * A thin usage bar showing the current tenant/subtenant usage window(s).
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
  display,
  customUsageBar,
  color = '#1890ff',
  refreshKey,
  debug = false,
}: UsageBarProps): JSX.Element | null {
  const cfg = useMemo(() => ({ ...DEFAULT_DISPLAY, ...display }), [display]);

  const client = useMemo(() => {
    if (!apiKey) return null;
    return new DevicApiClient({
      apiKey,
      baseUrl: baseUrl || 'https://api.devic.ai',
    });
  }, [apiKey, baseUrl]);

  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [loaded, setLoaded] = useState(false);
  // onDemand starts hidden; 'always' is effectively visible from the start.
  const [visible, setVisible] = useState(mode !== 'onDemand');

  const fetchUsage = useCallback(async () => {
    if (!client || !tenantId) return;
    try {
      const data = await client.getTenantUsage(tenantId, subtenantId);
      setUsage(data || null);
    } catch (err) {
      if (debug) console.warn('[UsageBar] getTenantUsage failed:', err);
      setUsage(null);
    } finally {
      setLoaded(true);
    }
  }, [client, tenantId, subtenantId, debug]);

  // A custom renderer always wants the data, regardless of the onDemand toggle.
  const active = !!customUsageBar || visible;

  useEffect(() => {
    if (!active) return;
    void fetchUsage();
  }, [active, fetchUsage, refreshKey]);

  // Applicable rules: filter by metric, sort most-restrictive first.
  const filteredSorted = useMemo(() => {
    const pool = (usage?.usage || []).filter(
      (r) => !metric || r.metric === metric,
    );
    return [...pool].sort((a, b) => b.percent - a.percent);
  }, [usage, metric]);

  // Default UI honours showAllRules; custom renderers always get the full set.
  const rules = useMemo(
    () => (cfg.showAllRules ? filteredSorted : filteredSorted.slice(0, 1)),
    [filteredSorted, cfg.showAllRules],
  );

  const tierId = usage?.tierId || filteredSorted[0]?.tierId;

  if (!tenantId || !client) return null;

  // Custom renderer fully replaces the default UI; hand it the live data.
  if (customUsageBar) {
    return (
      <>
        {customUsageBar({
          tenantId,
          subtenantId,
          tierId,
          rules: filteredSorted,
          loading: !loaded,
        })}
      </>
    );
  }

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
  if (rules.length === 0) {
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

  const showTierChip = cfg.showTier && !!tierId;
  const multi = rules.length > 1;
  // A header carries the tier chip and/or the onDemand collapse control, so the
  // collapse "×" has a stable home regardless of how many rows render below.
  const header =
    showTierChip || mode === 'onDemand' ? (
      <div className="devic-usage-bar-head">
        {showTierChip ? (
          <span className="devic-usage-tier" title={`Tier: ${tierId}`}>
            {tierId}
          </span>
        ) : (
          <span />
        )}
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
    ) : null;

  return (
    <div className="devic-usage-bar-wrap" data-mode={mode}>
      {header}
      {/* All rows share a single container by default. */}
      <div className="devic-usage-bar-group">
        {rules.map((rule, i) => {
          const pct = Math.min(100, Math.round(rule.percent));
          const fill = fillColor(pct, color);
          const valuesText = `${formatAmount(rule.current, rule.metric)} / ${formatAmount(
            rule.limit,
            rule.metric,
          )} ${rule.metric}`;
          // Distinguish rows by metric when several render; otherwise use the
          // scope-aware label so single-rule mode reads "Usage 24%".
          const prefix = multi
            ? rule.metric === 'cost'
              ? 'Cost'
              : 'Tokens'
            : rule.scope === 'subtenant'
              ? 'Your usage'
              : 'Usage';
          const main: string[] = [];
          if (cfg.showPercent) main.push(`${pct}%`);
          if (cfg.showValues) main.push(valuesText);
          if (main.length === 0) main.push(`${pct}%`);
          const label = `${prefix} ${main.join(' · ')}`.trim();
          const reset = resetLabel(rule.resetsAt);
          const win = windowLabel(rule.windowUnit, rule.windowEvery);
          const title = `${valuesText} · ${win}${reset ? ` · ${reset}` : ''}`;

          return (
            <div
              key={`${rule.metric}-${rule.windowUnit}-${rule.windowEvery}-${rule.scope}-${i}`}
              className="devic-usage-bar"
              title={title}
              data-state={pct >= 100 ? 'exceeded' : 'ok'}
            >
              <span className="devic-usage-bar-label">{label}</span>
              <div className="devic-usage-bar-track">
                <div
                  className="devic-usage-bar-fill"
                  style={{ width: `${pct}%`, backgroundColor: fill }}
                />
              </div>
              {cfg.showWindow && (
                <span className="devic-usage-bar-window">{win}</span>
              )}
              {reset && <span className="devic-usage-bar-reset">{reset}</span>}
            </div>
          );
        })}
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

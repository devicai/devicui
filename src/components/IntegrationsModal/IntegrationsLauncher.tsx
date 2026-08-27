import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { Integration, TenantMcpServer } from "../../api/types";
import { IntegrationLogo } from "./IntegrationLogo";
import type { IntegrationsState } from "./useIntegrations";
import type { TenantMcpState } from "./useTenantMcp";
import "./IntegrationsModal.css";

/** How many logos fit before the rest are counted instead. */
export const DEFAULT_MAX_LOGOS = 6;

export interface IntegrationsLauncherProps {
  /** Shared listing, so this and the modal load the catalogue once. */
  state: IntegrationsState;
  /**
   * The tenant's own MCP servers, when offered. Counted here because an
   * assistant may offer nothing but those, and a control that only knew about
   * apps would leave that panel with no way in.
   */
  mcp?: TenantMcpState;
  onClick: () => void;
  /** Tooltip and accessible name. @default "Connected apps" */
  label?: string;
  /** Logos shown before the `+N` box. @default 6 */
  maxLogos?: number;
  /**
   * Whether the surrounding surface is dark, so the logo chips go light. Many
   * app logos are solid black on transparency and vanish otherwise.
   */
  dark?: boolean;
  /**
   * How many placeholder chips to hold while the listing is on its way.
   *
   * Only pass a number when the apps are known to exist — the assistant having
   * said so — never on the chance that they might. A placeholder is a promise
   * that something is coming, and one that resolves to nothing is worse than
   * the gap it filled.
   */
  placeholders?: number;
  /**
   * Whether the requests that decide if this control exists are still running.
   *
   * Unlike `placeholders`, this makes no claim about what will arrive — only
   * that the answer is not in yet. It holds a single chip, which is the
   * smallest promise that can be made, and is the difference between a header
   * that fills in and one that appears to change its mind.
   */
  loading?: boolean;
  className?: string;
}

/** Connected first: with more apps than fit, those are the ones worth showing. */
function order(integrations: Integration[]): Integration[] {
  return [...integrations].sort((a, b) => {
    if (a.connected !== b.connected) return a.connected ? -1 : 1;
    return 0;
  });
}

/**
 * Logos a row this wide can afford.
 *
 * The stack shares the drawer header with a title, the conversation picker and
 * two more buttons, and a 400px drawer is the common case. Six logos there push
 * the picker down to a stub — so on a narrow header the count drops and the
 * `+N` box absorbs the difference, which is what it is for.
 */
function logosThatFit(hostWidth: number, max: number): number {
  if (!hostWidth) return max;
  if (hostWidth >= 520) return max;
  if (hostWidth >= 460) return Math.min(max, 5);
  return Math.min(max, 4);
}

/**
 * The header control that opens the connected-apps modal, drawn as the real
 * logos of the apps on offer.
 *
 * It renders nothing until the server has confirmed the assistant offers apps
 * to its tenants. A button that opens an empty dialog is worse than no button:
 * it promises the end user something the assistant was never configured to
 * give them.
 */
export function IntegrationsLauncher({
  state,
  mcp,
  onClick,
  label = "Connected apps",
  maxLogos = DEFAULT_MAX_LOGOS,
  dark = false,
  placeholders = 0,
  loading = false,
  className = "",
}: IntegrationsLauncherProps): JSX.Element | null {
  const sorted = useMemo(() => order(state.integrations), [state.integrations]);
  // Only the servers this tenant actually connected: an offer they have not
  // taken up is not a logo, it is an invitation, and the modal is where
  // invitations belong.
  const mcpConnected = useMemo(
    () => (mcp?.offered ? (mcp.servers ?? []).filter((s) => s.connection) : []),
    [mcp?.offered, mcp?.servers]
  );
  const ref = useRef<HTMLButtonElement>(null);
  const [fit, setFit] = useState(maxLogos);

  useEffect(() => {
    const host =
      ref.current?.closest(".devic-drawer-header") ??
      ref.current?.parentElement;
    if (!host || typeof ResizeObserver === "undefined") return;
    const measure = () =>
      setFit(logosThatFit(host.getBoundingClientRect().width, maxLogos));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [maxLogos, state.offered]);

  // Nothing yet, but the assistant has already said there will be — or the
  // answer is simply not in. Hold the shape rather than let the header reflow
  // when the logos land.
  const holding = placeholders > 0 ? placeholders : loading ? 1 : 0;
  if (sorted.length === 0 && mcpConnected.length === 0 && holding > 0) {
    return (
      <span
        className={`devic-int-launcher devic-int-launcher-loading ${className}`.trim()}
        data-dark={dark}
        aria-busy="true"
        aria-label={`${label} (loading)`}
      >
        {Array.from({ length: Math.min(holding, Math.max(1, fit)) }).map(
          (_, i) => (
            <span
              key={i}
              className="devic-int-launcher-item devic-int-launcher-skeleton"
            />
          )
        )}
      </span>
    );
  }

  const offersApps = state.offered && sorted.length > 0;
  if (!offersApps && mcpConnected.length === 0) return null;

  const appsShown = offersApps ? sorted.slice(0, Math.max(1, fit)) : [];
  // Servers fill whatever room the apps left, so an assistant with both does
  // not push the header wider than it was.
  const mcpShown = mcpConnected.slice(
    0,
    Math.max(offersApps ? 0 : 1, Math.max(1, fit) - appsShown.length)
  );
  const total = sorted.length + mcpConnected.length;
  const extra = total - appsShown.length - mcpShown.length;
  const connected =
    sorted.filter((i) => i.connected).length +
    mcpConnected.filter((s) => s.connection?.status === "active").length;

  return (
    <button
      type="button"
      ref={ref}
      className={`devic-int-launcher ${className}`.trim()}
      data-dark={dark}
      onClick={onClick}
      title={label}
      aria-label={`${label} (${connected}/${total} connected)`}
    >
      {appsShown.map((integration) => (
        <span
          key={integration.app}
          className="devic-int-launcher-item"
          // Dimmed until connected, so the stack doubles as the status: the
          // end user can see at a glance which of their apps are set up.
          data-connected={integration.connected}
          title={integration.name}
        >
          <IntegrationLogo
            integration={integration}
            className="devic-int-launcher-logo"
          />
        </span>
      ))}
      {mcpShown.map((server) => (
        <span
          key={server.connection!.id}
          className="devic-int-launcher-item"
          data-connected={server.connection!.status === "active"}
          title={server.name}
        >
          {server.logoUrl ? (
            <img
              className="devic-int-launcher-logo"
              src={server.logoUrl}
              alt=""
              aria-hidden="true"
            />
          ) : (
            <span className="devic-int-launcher-logo devic-int-launcher-initial">
              {server.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </span>
      ))}
      {extra > 0 && (
        <span className="devic-int-launcher-item devic-int-launcher-more">
          +{extra}
        </span>
      )}
    </button>
  );
}

export default IntegrationsLauncher;

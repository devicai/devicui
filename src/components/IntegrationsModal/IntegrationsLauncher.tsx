import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { Integration } from "../../api/types";
import { IntegrationLogo } from "./IntegrationLogo";
import type { IntegrationsState } from "./useIntegrations";
import "./IntegrationsModal.css";

/** How many logos fit before the rest are counted instead. */
export const DEFAULT_MAX_LOGOS = 6;

export interface IntegrationsLauncherProps {
  /** Shared listing, so this and the modal load the catalogue once. */
  state: IntegrationsState;
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
  onClick,
  label = "Connected apps",
  maxLogos = DEFAULT_MAX_LOGOS,
  dark = false,
  placeholders = 0,
  className = "",
}: IntegrationsLauncherProps): JSX.Element | null {
  const sorted = useMemo(() => order(state.integrations), [state.integrations]);
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

  // Nothing yet, but the assistant has already said there will be: hold the
  // shape rather than let the header reflow when the logos land.
  if (sorted.length === 0 && placeholders > 0) {
    return (
      <span
        className={`devic-int-launcher devic-int-launcher-loading ${className}`.trim()}
        data-dark={dark}
        aria-busy="true"
        aria-label={`${label} (loading)`}
      >
        {Array.from({ length: Math.min(placeholders, Math.max(1, fit)) }).map(
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

  if (!state.offered || sorted.length === 0) return null;

  const shown = sorted.slice(0, Math.max(1, fit));
  const extra = sorted.length - shown.length;
  const connected = sorted.filter((i) => i.connected).length;

  return (
    <button
      type="button"
      ref={ref}
      className={`devic-int-launcher ${className}`.trim()}
      data-dark={dark}
      onClick={onClick}
      title={label}
      aria-label={`${label} (${connected}/${sorted.length} connected)`}
    >
      {shown.map((integration) => (
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
      {extra > 0 && (
        <span className="devic-int-launcher-item devic-int-launcher-more">
          +{extra}
        </span>
      )}
    </button>
  );
}

export default IntegrationsLauncher;

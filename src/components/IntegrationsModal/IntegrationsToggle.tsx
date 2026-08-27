import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { Integration, TenantMcpServer } from "../../api/types";
import { IntegrationLogo } from "./IntegrationLogo";
import type { IntegrationsState } from "./useIntegrations";
import type { TenantMcpState } from "./useTenantMcp";
import "./IntegrationsModal.css";

export interface IntegrationsToggleProps {
  /** Shared listing (see `useIntegrations`). */
  state: IntegrationsState;
  /**
   * The tenant's own MCP servers, when the assistant offers them (see
   * `useTenantMcp`). Their connected servers are listed under the apps and
   * switch off the same way — a server the end user connected is as much
   * theirs to leave out of a message as an account is.
   */
  mcp?: TenantMcpState;
  /**
   * What is switched off right now. App slugs, and the `toggleId` of a
   * connected MCP server — one list, because that is what the message carries
   * and what the server keeps for the rest of the turn.
   */
  disabled: string[];
  /** Called with the full new list of switched-off entries. */
  onChange: (disabled: string[]) => void;
  /** Opens the connected-apps modal, to connect one more. */
  onManage?: () => void;
  /** Tooltip and accessible name. @default "Apps in this chat" */
  label?: string;
  /** Light-on-dark, for a dark composer. */
  dark?: boolean;
  /** Disables the control while a message is in flight. */
  busy?: boolean;
  /**
   * Whether the requests that decide if this control exists are still running.
   *
   * Holds an inert plug in the row rather than letting the attach and mic
   * buttons shift sideways the moment the answer lands.
   */
  loading?: boolean;
  className?: string;
}

/** A plug, matching the weight of the attach and mic icons beside it. */
function PlugIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 2v6" />
      <path d="M15 2v6" />
      <path d="M6 8h12v3a6 6 0 0 1-12 0z" />
      <path d="M12 17v5" />
    </svg>
  );
}

/** A server's own logo when it has one, its initial when it does not. */
function McpBadge({ server }: { server: TenantMcpServer }): JSX.Element {
  if (server.logoUrl) {
    return (
      <img
        className="devic-int-toggle-mcp-logo"
        src={server.logoUrl}
        alt=""
        aria-hidden="true"
      />
    );
  }
  return (
    <span
      className="devic-int-toggle-mcp-logo devic-int-toggle-mcp-fallback"
      aria-hidden="true"
    >
      {server.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * Which apps the assistant may reach on the next message.
 *
 * Only apps the end user has actually connected appear: an app they have not
 * set up is not something they can switch off, and listing it here would turn
 * this into a second, worse version of the connect dialog.
 *
 * The choice lives in the caller and travels with each message. Nothing is
 * remembered on the server and nothing is disconnected — switching Gmail off
 * for a question about a spreadsheet must not cost an OAuth round trip to
 * undo, which is the whole reason this exists next to the composer rather than
 * inside the apps dialog.
 */
export function IntegrationsToggle({
  state,
  mcp,
  disabled,
  onChange,
  onManage,
  label = "Apps in this chat",
  dark = false,
  busy = false,
  loading = false,
  className = "",
}: IntegrationsToggleProps): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const connected = useMemo(
    () => state.integrations.filter((i) => i.connected),
    [state.integrations]
  );

  // Connected and usable: one still waiting for its consent screen, or whose
  // last probe failed, contributes no tools, so switching it off would be
  // switching off nothing. It belongs in the panel that can fix it, not here.
  const mcpServers = useMemo(
    () =>
      (mcp?.servers ?? []).filter(
        (s) => s.connection?.status === "active" && !!s.connection.toggleId
      ),
    [mcp?.servers]
  );

  // Closing on an outside click and on Escape, the two ways every popover is
  // expected to close. Bound only while open so a drawer full of these costs
  // nothing when they are all shut.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  // An end user with nothing connected has nothing to switch: the button would
  // open an empty box. It appears the moment they connect their first app — or
  // their first MCP server, which is as switchable as an account is.
  const hasApps = state.offered && connected.length > 0;
  const hasMcp = !!mcp?.offered && mcpServers.length > 0;

  if (!hasApps && !hasMcp) {
    if (!loading) return null;
    // Still being decided: hold the slot, inert, so the row does not shift.
    return (
      <div className={`devic-int-toggle ${className}`.trim()} data-dark={dark}>
        <button
          type="button"
          className="devic-input-btn devic-int-toggle-btn devic-int-toggle-btn-loading"
          disabled
          aria-busy="true"
          aria-label={`${label} (loading)`}
          title={label}
        >
          <PlugIcon />
        </button>
      </div>
    );
  }

  const off = new Set(disabled);

  /** Everything still on offer, so a stale entry can never survive a rewrite. */
  const liveIds = [
    ...connected.map((i) => i.app),
    ...mcpServers.map((s) => s.connection!.toggleId as string),
  ];
  const offCount = liveIds.filter((id) => off.has(id)).length;

  const flip = (id: string) => {
    const next = new Set(off);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Only what is still on offer is kept: carrying an entry for an app or a
    // server the user has since disconnected would silently switch it off again
    // if they ever connected it back.
    onChange(liveIds.filter((candidate) => next.has(candidate)));
  };

  return (
    <div
      className={`devic-int-toggle ${className}`.trim()}
      data-dark={dark}
      ref={ref}
    >
      <button
        type="button"
        className="devic-input-btn devic-int-toggle-btn"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        title={
          offCount
            ? `${label} — ${offCount} switched off`
            : label
        }
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-some-off={offCount > 0 || undefined}
      >
        <PlugIcon />
        {offCount > 0 && (
          <span className="devic-int-toggle-badge" aria-hidden="true">
            {offCount}
          </span>
        )}
      </button>

      {open && (
        <div className="devic-int-toggle-popover" role="dialog" aria-label={label}>
          <div className="devic-int-toggle-head">
            <strong>{label}</strong>
            <span>
              Switched off here, {hasMcp && !hasApps ? "a server" : "an app"}{" "}
              sits out your next message. It stays connected.
            </span>
          </div>

          <ul className="devic-int-toggle-list">
            {connected.map((integration) => (
              <li key={integration.app}>
                <label className="devic-int-toggle-row">
                  <span className="devic-int-toggle-app">
                    <IntegrationLogo integration={integration} />
                    <span className="devic-int-toggle-name">
                      {integration.name}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="devic-int-toggle-switch"
                    checked={!off.has(integration.app)}
                    onChange={() => flip(integration.app)}
                    aria-label={`Use ${integration.name} in this chat`}
                  />
                </label>
              </li>
            ))}

            {/* Named apart only when both kinds are present: with servers
                alone the heading would label the entire list. */}
            {hasMcp && hasApps && (
              <li className="devic-int-toggle-group" aria-hidden="true">
                MCP servers
              </li>
            )}

            {mcpServers.map((server) => {
              const id = server.connection!.toggleId as string;
              return (
                <li key={id}>
                  <label className="devic-int-toggle-row">
                    <span className="devic-int-toggle-app">
                      <McpBadge server={server} />
                      <span className="devic-int-toggle-name">
                        {server.name}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      className="devic-int-toggle-switch"
                      checked={!off.has(id)}
                      onChange={() => flip(id)}
                      aria-label={`Use ${server.name} in this chat`}
                    />
                  </label>
                </li>
              );
            })}
          </ul>

          {onManage && (
            <button
              type="button"
              className="devic-int-toggle-manage"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
            >
              {hasMcp && !hasApps
                ? "Manage connected servers"
                : "Manage connected apps"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default IntegrationsToggle;
